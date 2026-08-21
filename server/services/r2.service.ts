import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';

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

export function buildPhotoThumbKey(galleryId: string) {
  return `events/${galleryId}/photos/${randomUUID()}.thumb.webp`;
}

export function buildZipStorageKey(userId: string, galleryId: string) {
  return `tmp/zips/${userId}/${galleryId}/${randomUUID()}.zip`;
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

/**
 * Envia um stream ao R2 via multipart (Upload).
 * PutObject exige Content-Length; o R2 rejeita stream de tamanho desconhecido.
 */
export function startFileStreamUpload(input: {
  storageKey: string;
  body: Readable;
  mimeType: string;
}) {
  const { client, bucket } = createR2Client();
  const upload = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: input.storageKey,
      Body: input.body,
      ContentType: input.mimeType,
    },
    queueSize: 1,
    partSize: 5 * 1024 * 1024,
    leavePartsOnError: false,
  });

  return {
    done: () => upload.done().then(() => ({ storageKey: input.storageKey })),
    abort: () => upload.abort(),
  };
}

export async function uploadFileStream(input: {
  storageKey: string;
  body: Readable;
  mimeType: string;
  contentLength?: number;
}) {
  const started = startFileStreamUpload(input);
  return started.done();
}

/** Concatena objetos R2 em sequência e grava a chave final. */
export async function assembleStoredParts(input: {
  partKeys: string[];
  storageKey: string;
  mimeType: string;
  contentLength: number;
}) {
  async function* parts() {
    for (const key of input.partKeys) {
      const file = await getObjectStream(key);
      for await (const chunk of file.stream) {
        yield chunk;
      }
    }
  }

  await uploadFileStream({
    storageKey: input.storageKey,
    body: Readable.from(parts()),
    mimeType: input.mimeType,
    contentLength: input.contentLength,
  });
}

export function uploadPartKeys(sessionToken: string, partCount: number) {
  return Array.from({ length: partCount }, (_, index) =>
    buildUploadPartKey(sessionToken, index + 1)
  );
}

export async function deleteExpiredPrefix(input: {
  prefix: string;
  olderThan: Date;
  maxKeys?: number;
}) {
  const { client, bucket } = createR2Client();
  const listed = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: input.prefix,
      MaxKeys: input.maxKeys ?? 80,
    })
  );
  const stale = (listed.Contents ?? []).filter(
    (item) =>
      item.Key &&
      item.LastModified &&
      item.LastModified.getTime() < input.olderThan.getTime()
  );
  const keys = stale
    .map((item) => item.Key)
    .filter((key): key is string => Boolean(key));
  if (keys.length === 0) return { deleted: 0 };

  await client.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: keys.map((Key) => ({ Key })),
        Quiet: true,
      },
    })
  );
  return { deleted: keys.length };
}

/** Remove partes tmp/uploads deixadas por sessões expiradas ou abortadas. */
export async function cleanupExpiredUploadParts() {
  const olderThanParts = new Date(Date.now() - 45 * 60 * 1000);
  const olderThanZips = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const parts = await deleteExpiredPrefix({
    prefix: 'tmp/uploads/',
    olderThan: olderThanParts,
    maxKeys: 80,
  });
  const zips = await deleteExpiredPrefix({
    prefix: 'tmp/zips/',
    olderThan: olderThanZips,
    maxKeys: 40,
  });
  return { deleted: parts.deleted + zips.deleted };
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

export function isMissingR2Object(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const record = error as {
    name?: string;
    Code?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const code = record.Code ?? record.code ?? record.name ?? '';
  const status = record.$metadata?.httpStatusCode;
  return (
    code === 'NoSuchKey' ||
    code === 'NotFound' ||
    code === 'NoSuchBucket' ||
    status === 404
  );
}

/** true se o objeto saiu do R2 (apagado ou já inexistente). */
export async function deleteStoredObject(storageKey: string) {
  try {
    await deleteFile(storageKey);
    return true;
  } catch (error) {
    if (isMissingR2Object(error)) return true;
    console.warn(`Falha ao apagar objeto no R2 (${storageKey}):`, error);
    return false;
  }
}
