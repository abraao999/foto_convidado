import { Readable } from 'node:stream';
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
      rootFolderId,
    };
  }

  // Conta de serviço só deve ser usada quando a pasta pertence a um
  // Shared Drive. Pastas compartilhadas do "Meu Drive" não fornecem cota.
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
      rootFolderId,
    };
  }

  throw new Error('O Google Drive ainda não está configurado no servidor.');
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
