import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`A variável ${name} não está configurada.`);
  }
  return value;
}

function createR2Client() {
  const accountId = requireEnv('R2_ACCOUNT_ID');
  const endpoint =
    process.env.R2_ENDPOINT?.trim() ||
    `https://${accountId}.r2.cloudflarestorage.com`;

  return {
    client: new S3Client({
      region: 'auto',
      endpoint,
      forcePathStyle: true,
      // SDKs recentes enviam checksums que o R2 ainda não trata bem.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
      },
    }),
    bucket: requireEnv('R2_BUCKET_NAME'),
  };
}

function extensionFromName(fileName: string, mimeType?: string) {
  const fromName = fileName
    .split('.')
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (fromName) return fromName;
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/heic') return 'heic';
  if (mimeType === 'image/heif') return 'heif';
  return 'jpg';
}

/** Chaves R2 no formato events/... ou users/... */
export function isR2StorageKey(value: string) {
  return value.includes('/');
}

export function buildPhotoStorageKey(
  galleryId: string,
  fileName: string,
  mimeType?: string
) {
  const ext = extensionFromName(fileName, mimeType);
  return `events/${galleryId}/photos/${randomUUID()}.${ext}`;
}

export function buildUploadPartKey(sessionToken: string, partNumber: number) {
  return `tmp/uploads/${sessionToken}/part-${String(partNumber).padStart(5, '0')}`;
}

export function buildCoverStorageKey(
  galleryId: string,
  fileName: string,
  mimeType?: string
) {
  const ext = extensionFromName(fileName, mimeType);
  return `events/${galleryId}/cover/${randomUUID()}.${ext}`;
}

export function buildAvatarStorageKey(
  userId: string,
  fileName: string,
  mimeType?: string
) {
  const ext = extensionFromName(fileName, mimeType);
  return `users/${userId}/avatar/${randomUUID()}.${ext}`;
}

export async function uploadFile(input: {
  storageKey: string;
  buffer: Buffer;
  mimeType: string;
}) {
  const { client, bucket } = createR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.storageKey,
      Body: input.buffer,
      ContentType: input.mimeType,
    })
  );
  return { storageKey: input.storageKey };
}

export async function getObjectStream(storageKey: string) {
  const { client, bucket } = createR2Client();
  const result = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    })
  );
  if (!result.Body) {
    throw new Error('Arquivo não encontrado no R2.');
  }

  const body = result.Body as {
    pipe?: unknown;
    transformToByteArray?: () => Promise<Uint8Array>;
  };

  let stream: Readable;
  if (typeof body.pipe === 'function') {
    stream = body as Readable;
  } else if (typeof body.transformToByteArray === 'function') {
    const bytes = await body.transformToByteArray();
    stream = Readable.from(Buffer.from(bytes));
  } else {
    throw new Error('Resposta inválida ao ler arquivo do R2.');
  }

  return {
    stream,
    mimeType: result.ContentType ?? 'application/octet-stream',
    contentLength: result.ContentLength,
  };
}

export async function getSignedDownloadUrl(
  storageKey: string,
  expiresInSeconds = 300,
  fileName?: string
) {
  const { client, bucket } = createR2Client();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    ...(fileName
      ? {
          ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, '')}"`,
        }
      : {}),
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

export async function deleteFile(storageKey: string) {
  const { client, bucket } = createR2Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    })
  );
}
