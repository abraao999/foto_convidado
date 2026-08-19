import { Readable } from 'node:stream';
import type { OAuth2Client } from 'google-auth-library';
import { google, type drive_v3 } from 'googleapis';

function createDriveClient() {
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!rootFolderId) {
    throw new Error('O Google Drive ainda não está configurado no servidor.');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (clientId && clientSecret && refreshToken) {
    const oauth = new google.auth.OAuth2(clientId, clientSecret);
    oauth.setCredentials({ refresh_token: refreshToken });
    return {
      drive: google.drive({ version: 'v3', auth: oauth }),
      auth: oauth,
      rootFolderId,
    };
  }

  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (
    serviceAccountJson &&
    process.env.GOOGLE_DRIVE_USE_SERVICE_ACCOUNT === 'true'
  ) {
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(serviceAccountJson) as Record<string, unknown>;
    } catch {
      throw new Error('A credencial da conta de serviço do Google é inválida.');
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    return {
      drive: google.drive({ version: 'v3', auth }),
      auth,
      rootFolderId,
    };
  }

  throw new Error('O Google Drive ainda não está configurado no servidor.');
}

async function getAccessToken(
  auth: OAuth2Client | InstanceType<typeof google.auth.GoogleAuth>
) {
  if ('getAccessToken' in auth && typeof auth.getAccessToken === 'function') {
    const token = await auth.getAccessToken();
    if (typeof token === 'string') return token;
    if (token && typeof token === 'object' && 'token' in token) {
      return token.token ?? null;
    }
  }
  return null;
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function getOrCreateFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string
) {
  const result = await drive.files.list({
    q: [
      `'${escapeDriveQuery(parentId)}' in parents`,
      `name = '${escapeDriveQuery(name)}'`,
      `mimeType = 'application/vnd.google-apps.folder'`,
      'trashed = false',
    ].join(' and '),
    fields: 'files(id)',
    pageSize: 1,
  });

  const existingId = result.data.files?.[0]?.id;
  if (existingId) return existingId;

  const created = await drive.files.create({
    requestBody: {
      name,
      parents: [parentId],
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });

  if (!created.data.id) {
    throw new Error('Não foi possível criar a pasta no Google Drive.');
  }
  return created.data.id;
}

export async function uploadProfileAvatar(input: {
  userId: string;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}) {
  const { drive, rootFolderId } = createDriveClient();
  const userFolderId = await getOrCreateFolder(
    drive,
    `user-${input.userId}`,
    rootFolderId
  );
  const profileFolderId = await getOrCreateFolder(
    drive,
    'profile',
    userFolderId
  );

  const extension =
    input.originalName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ||
    'jpg';
  const uploaded = await drive.files.create({
    requestBody: {
      name: `avatar-${Date.now()}.${extension}`,
      parents: [profileFolderId],
    },
    media: {
      mimeType: input.mimeType,
      body: Readable.from(input.buffer),
    },
    fields: 'id',
  });

  const fileId = uploaded.data.id;
  if (!fileId) throw new Error('O Google Drive não retornou o arquivo enviado.');

  await drive.permissions.create({
    fileId,
    requestBody: { type: 'anyone', role: 'reader' },
  });

  return {
    fileId,
    url: `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w512`,
  };
}

export async function downloadProfileAvatar(fileId: string) {
  const { drive } = createDriveClient();
  const [metadata, media] = await Promise.all([
    drive.files.get({
      fileId,
      fields: 'mimeType',
    }),
    drive.files.get(
      {
        fileId,
        alt: 'media',
      },
      { responseType: 'stream' }
    ),
  ]);

  return {
    mimeType: metadata.data.mimeType ?? 'image/jpeg',
    stream: media.data,
  };
}

async function getGalleryFolderId(userId: string, galleryId: string) {
  const { drive, rootFolderId } = createDriveClient();
  const userFolderId = await getOrCreateFolder(
    drive,
    `user-${userId}`,
    rootFolderId
  );
  return getOrCreateFolder(drive, `gallery-${galleryId}`, userFolderId);
}

export async function createResumableGalleryUpload(input: {
  userId: string;
  galleryId: string;
  mimeType: string;
  originalName: string;
  size: number;
}) {
  const { drive, auth } = createDriveClient();
  const galleryFolderId = await getGalleryFolderId(
    input.userId,
    input.galleryId
  );
  const safeName = input.originalName
    .normalize('NFKC')
    .replace(/[\u0000-\u001f/\\]/g, '-')
    .slice(0, 180);

  const accessToken = await getAccessToken(auth);
  if (!accessToken) {
    throw new Error('Não foi possível autenticar no Google Drive.');
  }

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': input.mimeType,
        'X-Upload-Content-Length': String(input.size),
      },
      body: JSON.stringify({
        name: `${Date.now()}-${safeName}`,
        parents: [galleryFolderId],
        mimeType: input.mimeType,
      }),
    }
  );

  if (!response.ok) {
    throw new Error('Não foi possível iniciar o envio no Google Drive.');
  }

  const uploadUrl = response.headers.get('location');
  if (!uploadUrl) {
    throw new Error('O Google Drive não retornou a URL de envio.');
  }

  return { uploadUrl };
}

export async function uploadResumableChunk(input: {
  uploadUrl: string;
  buffer: Buffer;
  start: number;
  total: number;
  mimeType: string;
}) {
  const end = input.start + input.buffer.length - 1;
  const response = await fetch(input.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': String(input.buffer.length),
      'Content-Type': input.mimeType,
      'Content-Range': `bytes ${input.start}-${end}/${input.total}`,
    },
    body: new Uint8Array(input.buffer),
  });

  if (response.status === 308) {
    return { complete: false as const };
  }

  if (response.status === 200 || response.status === 201) {
    const data = (await response.json()) as { id?: string };
    if (!data.id) throw new Error('Upload incompleto no Google Drive.');
    return { complete: true as const, fileId: data.id };
  }

  throw new Error('Falha ao enviar parte do arquivo.');
}

export async function makeDriveFilePublic(fileId: string) {
  const { drive } = createDriveClient();
  await drive.permissions.create({
    fileId,
    requestBody: { type: 'anyone', role: 'reader' },
  });
}

export async function uploadGalleryPhoto(input: {
  userId: string;
  galleryId: string;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}) {
  const { drive } = createDriveClient();
  const galleryFolderId = await getGalleryFolderId(
    input.userId,
    input.galleryId
  );
  const safeName = input.originalName
    .normalize('NFKC')
    .replace(/[\u0000-\u001f/\\]/g, '-')
    .slice(0, 180);

  const uploaded = await drive.files.create({
    requestBody: {
      name: `${Date.now()}-${safeName}`,
      parents: [galleryFolderId],
    },
    media: {
      mimeType: input.mimeType,
      body: Readable.from(input.buffer),
    },
    fields: 'id',
  });

  const fileId = uploaded.data.id;
  if (!fileId) throw new Error('O Google Drive não retornou o arquivo enviado.');

  await drive.permissions.create({
    fileId,
    requestBody: { type: 'anyone', role: 'reader' },
  });

  return {
    fileId,
    thumbnailUrl: `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1200`,
  };
}

export async function downloadDriveFile(fileId: string) {
  const { drive } = createDriveClient();
  const media = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );
  return media.data;
}
