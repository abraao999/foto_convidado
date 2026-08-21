import crypto from 'node:crypto';
import { PassThrough, type Readable } from 'node:stream';
import { ZipArchive } from 'archiver';
import { Types } from 'mongoose';
import { platformConfig } from '../config/platform.js';
import { Gallery } from '../models/Gallery.js';
import { Photo, type IPhotoDocument } from '../models/Photo.js';
import { UploadSession } from '../models/UploadSession.js';
import {
  getPublishedGalleryBySlug,
  serializePublicGallery,
} from './gallery.service.js';
import {
  assembleStoredParts,
  buildPhotoStorageKey,
  buildPhotoThumbKey,
  buildUploadPartKey,
  buildZipStorageKey,
  deleteFile,
  deleteStoredObject,
  getSignedDownloadUrl,
  startFileStreamUpload,
  uploadFile,
  uploadPartKeys,
} from './r2.service.js';
import { openStoredFile } from './storage-read.service.js';
import { hasValidImageSignature } from '../utils/image-signature.js';
import {
  createHeicPreview,
  createWebpThumbnail,
  isHeicPhoto,
  streamToBuffer,
} from '../utils/image-preview.js';
import { opsLog } from '../utils/ops-log.js';
import { canAcceptGalleryUploads } from './subscription.service.js';

export { hasValidImageSignature };

export interface PhotoUpload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const UPLOAD_LOCK_STALE_MS = 90 * 1000;
const PREVIEW_TTL_SECONDS = 60 * 60;
const MAX_THUMB_SOURCE_BYTES = 8 * 1024 * 1024;
export const PHOTO_LIST_PAGE_SIZE = 15;

export function photoListPaging(pageRaw?: number, limitRaw?: number) {
  const page =
    typeof pageRaw === 'number' && Number.isFinite(pageRaw) && pageRaw >= 1
      ? Math.floor(pageRaw)
      : 1;
  const limit =
    typeof limitRaw === 'number' && Number.isFinite(limitRaw) && limitRaw >= 1
      ? Math.min(50, Math.floor(limitRaw))
      : PHOTO_LIST_PAGE_SIZE;
  return { page, limit, skip: (page - 1) * limit };
}

export async function serializePhoto(photo: IPhotoDocument) {
  const id = photo._id.toString();
  const isHeic = isHeicPhoto(photo.mimeType, photo.fileName);
  const previewQuery = isHeic && !photo.thumbnailKey ? '&format=jpeg' : '';
  let thumbnailUrl = `/api/photos/${id}/content?v=${photo.updatedAt.getTime()}${previewQuery}`;
  const previewKey = photo.thumbnailKey || (!isHeic ? photo.storageKey : undefined);
  if (previewKey) {
    try {
      thumbnailUrl = await getSignedDownloadUrl(previewKey, PREVIEW_TTL_SECONDS);
    } catch (error) {
      console.warn('Falha ao assinar URL de preview:', error);
    }
  }
  return {
    id,
    galleryId: photo.galleryId.toString(),
    fileName: photo.fileName,
    thumbnailUrl,
    mimeType: photo.mimeType,
    size: photo.size,
    createdAt: photo.createdAt,
  };
}

async function maybeWriteThumbnail(photo: IPhotoDocument) {
  if (!photo.storageKey || photo.size > MAX_THUMB_SOURCE_BYTES) return photo;
  try {
    const file = await openStoredFile(photo.storageKey);
    let source = await streamToBuffer(file.stream);
    if (isHeicPhoto(photo.mimeType, photo.fileName)) {
      source = await createHeicPreview(source);
    }
    const webp = await createWebpThumbnail(source);
    const thumbnailKey = buildPhotoThumbKey(photo.galleryId.toString());
    await uploadFile({
      storageKey: thumbnailKey,
      buffer: webp,
      mimeType: 'image/webp',
    });
    photo.thumbnailKey = thumbnailKey;
    await photo.save();
  } catch (error) {
    console.warn(`Falha ao gerar thumbnail (${photo._id.toString()}):`, error);
  }
  return photo;
}

async function ownedGallery(userId: string, galleryId: string) {
  if (!Types.ObjectId.isValid(galleryId)) {
    throw new Error('Galeria não encontrada.');
  }
  const gallery = await Gallery.findOne({
    _id: new Types.ObjectId(galleryId),
    userId: new Types.ObjectId(userId),
    status: { $ne: 'ARCHIVED' },
  });
  if (!gallery) throw new Error('Galeria não encontrada.');
  return gallery;
}

async function resolveUploadGallery(input: {
  ownerUserId: string;
  galleryId: string;
  requirePublished?: boolean;
}) {
  if (!Types.ObjectId.isValid(input.galleryId)) {
    throw new Error('Galeria não encontrada.');
  }

  const gallery = await Gallery.findOne({
    _id: new Types.ObjectId(input.galleryId),
    userId: new Types.ObjectId(input.ownerUserId),
    status: { $ne: 'ARCHIVED' },
  });
  if (!gallery) throw new Error('Galeria não encontrada.');
  if (input.requirePublished && gallery.status !== 'PUBLISHED') {
    throw new Error('Esta galeria ainda não está publicada.');
  }

  const canUpload = await canAcceptGalleryUploads(input.ownerUserId);
  if (!canUpload) {
    throw new Error('Esta galeria não está aceitando novos envios no momento.');
  }

  return gallery;
}

async function assertStorageAvailable(userId: string, incomingSize: number) {
  const [usage] = await Photo.aggregate<{ total: number }>([
    { $match: { userId: new Types.ObjectId(userId) } },
    { $group: { _id: null, total: { $sum: '$size' } } },
  ]);
  if ((usage?.total ?? 0) + incomingSize > platformConfig.maxStorageBytes) {
    throw new Error('O envio ultrapassa o limite de armazenamento desta conta.');
  }
}

function validateUploadMeta(input: {
  fileName: string;
  mimeType: string;
  size: number;
}) {
  if (!allowedMimeTypes.has(input.mimeType)) {
    throw new Error('Formato não suportado. Use JPG, PNG, WebP ou HEIC.');
  }
  if (input.size <= 0 || input.size > platformConfig.maxPhotoBytes) {
    throw new Error(
      `Cada foto pode ter até ${Math.round(platformConfig.maxPhotoBytes / 1024 / 1024)} MB.`
    );
  }
}

async function getVisiblePublicGallery(slug: string) {
  const gallery = await getPublishedGalleryBySlug(slug);
  const visible = await canAcceptGalleryUploads(gallery.userId.toString());
  if (!visible) throw new Error('Galeria não encontrada ou indisponível.');
  return gallery;
}

export async function getPublicGalleryUploadInfo(slug: string) {
  const gallery = await getVisiblePublicGallery(slug);
  await resolveUploadGallery({
    ownerUserId: gallery.userId.toString(),
    galleryId: gallery._id.toString(),
    requirePublished: true,
  });
  return serializePublicGallery(gallery);
}

export async function listGalleryPhotos(
  userId: string,
  galleryId: string,
  paging = photoListPaging()
) {
  await ownedGallery(userId, galleryId);
  const filter = {
    userId: new Types.ObjectId(userId),
    galleryId: new Types.ObjectId(galleryId),
  };
  const [total, photos] = await Promise.all([
    Photo.countDocuments(filter),
    Photo.find(filter)
      .sort({ createdAt: -1 })
      .skip(paging.skip)
      .limit(paging.limit),
  ]);
  return {
    photos: await Promise.all(photos.map((photo) => serializePhoto(photo))),
    total,
    page: paging.page,
    limit: paging.limit,
  };
}

export async function listGalleryPhotoIds(
  userId: string,
  galleryId: string,
  max = platformConfig.zipMaxPhotos
) {
  await ownedGallery(userId, galleryId);
  const filter = {
    userId: new Types.ObjectId(userId),
    galleryId: new Types.ObjectId(galleryId),
  };
  const total = await Photo.countDocuments(filter);
  const photos = await Photo.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.max(1, max))
    .select('_id');
  return {
    ids: photos.map((photo) => photo._id.toString()),
    total,
  };
}

export async function initPhotoUpload(input: {
  ownerUserId: string;
  galleryId: string;
  fileName: string;
  mimeType: string;
  size: number;
  requirePublished?: boolean;
}) {
  validateUploadMeta(input);
  await resolveUploadGallery({
    ownerUserId: input.ownerUserId,
    galleryId: input.galleryId,
    requirePublished: input.requirePublished,
  });
  await assertStorageAvailable(input.ownerUserId, input.size);

  const storageKey = buildPhotoStorageKey(
    input.galleryId,
    input.fileName,
    input.mimeType
  );

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await UploadSession.create({
    token,
    userId: new Types.ObjectId(input.ownerUserId),
    galleryId: new Types.ObjectId(input.galleryId),
    storageKey,
    partCount: 0,
    fileName: input.fileName,
    mimeType: input.mimeType,
    totalSize: input.size,
    uploadedBytes: 0,
    requirePublished: Boolean(input.requirePublished),
    expiresAt,
  });

  return { sessionToken: token, chunkSize: platformConfig.uploadChunkBytes };
}

function staleLockDate(now = new Date()) {
  return new Date(now.getTime() - UPLOAD_LOCK_STALE_MS);
}

async function claimUploadSession(token: string) {
  const now = new Date();
  const session = await UploadSession.findOneAndUpdate(
    {
      token,
      expiresAt: { $gt: now },
      completedStorageKey: { $exists: false },
      $and: [
        {
          $or: [
            { lockedAt: { $exists: false } },
            { lockedAt: { $lt: staleLockDate(now) } },
          ],
        },
        {
          $or: [
            { completingAt: { $exists: false } },
            { completingAt: { $lt: staleLockDate(now) } },
          ],
        },
      ],
    },
    { $set: { lockedAt: now } },
    { new: true }
  );
  if (!session?.storageKey) {
    const existing = await UploadSession.findOne({ token });
    if (
      existing?.lockedAt &&
      existing.lockedAt.getTime() >= staleLockDate(now).getTime()
    ) {
      throw new Error('Envio em andamento. Aguarde um instante e tente novamente.');
    }
    throw new Error('Sessão de envio inválida ou expirada.');
  }
  return session;
}

async function releaseUploadLock(sessionId: Types.ObjectId) {
  await UploadSession.updateOne(
    { _id: sessionId, completedStorageKey: { $exists: false } },
    { $unset: { lockedAt: 1 } }
  );
}

async function cleanupSessionParts(token: string, partCount: number) {
  for (const partKey of uploadPartKeys(token, partCount)) {
    try {
      await deleteFile(partKey);
    } catch (error) {
      console.warn('Falha ao limpar parte temporária do R2:', error);
    }
  }
}

async function finalizeUploadSession(session: {
  _id: Types.ObjectId;
  token: string;
  userId: Types.ObjectId;
  galleryId: Types.ObjectId;
  storageKey: string;
  partCount: number;
  fileName: string;
  mimeType: string;
  totalSize: number;
  requirePublished?: boolean;
}) {
  const ownerUserId = session.userId.toString();
  await resolveUploadGallery({
    ownerUserId,
    galleryId: session.galleryId.toString(),
    requirePublished: session.requirePublished,
  });
  await assertStorageAvailable(ownerUserId, session.totalSize);

  const claimed = await UploadSession.findOneAndUpdate(
    {
      _id: session._id,
      completedStorageKey: { $exists: false },
      $or: [
        { completingAt: { $exists: false } },
        { completingAt: { $lt: staleLockDate() } },
      ],
    },
    { $set: { completingAt: new Date() } },
    { new: true }
  );
  if (!claimed) {
    throw new Error('Envio em andamento. Aguarde um instante e tente novamente.');
  }

  try {
    await assembleStoredParts({
      partKeys: uploadPartKeys(session.token, session.partCount),
      storageKey: session.storageKey,
      mimeType: session.mimeType,
      contentLength: session.totalSize,
    });

    const photo = await Photo.create({
      userId: session.userId,
      galleryId: session.galleryId,
      fileName: session.fileName,
      storageKey: session.storageKey,
      thumbnailUrl: `/api/photos/pending/content`,
      mimeType: session.mimeType,
      size: session.totalSize,
    });

    photo.thumbnailUrl = `/api/photos/${photo._id.toString()}/content`;
    await photo.save();
    await maybeWriteThumbnail(photo);

    claimed.completedStorageKey = session.storageKey;
    claimed.lockedAt = undefined;
    await claimed.save();

    await cleanupSessionParts(session.token, session.partCount);

    return {
      complete: true as const,
      photo: await serializePhoto(photo),
    };
  } catch (error) {
    await UploadSession.updateOne(
      { _id: session._id },
      { $unset: { completingAt: 1, lockedAt: 1 } }
    );
    throw error;
  }
}

export async function uploadPhotoChunk(input: {
  sessionToken: string;
  buffer: Buffer;
  expectedUserId?: string;
}) {
  const maxChunk = platformConfig.uploadChunkBytes + 512 * 1024;
  if (input.buffer.length === 0 || input.buffer.length > maxChunk) {
    throw new Error('Pedaço de envio inválido.');
  }

  const session = await claimUploadSession(input.sessionToken);
  try {
    if (
      input.expectedUserId &&
      session.userId.toString() !== input.expectedUserId
    ) {
      throw new Error('Sessão de envio inválida ou expirada.');
    }

    if (session.uploadedBytes >= session.totalSize) {
      return finalizeUploadSession(session);
    }

    if (
      session.uploadedBytes === 0 &&
      !hasValidImageSignature({ buffer: input.buffer })
    ) {
      throw new Error('O arquivo não contém uma imagem válida.');
    }

    const nextBytes = session.uploadedBytes + input.buffer.length;
    if (nextBytes > session.totalSize) {
      throw new Error('O envio ultrapassou o tamanho declarado do arquivo.');
    }

    const partNumber = session.partCount + 1;
    await uploadFile({
      storageKey: buildUploadPartKey(session.token, partNumber),
      buffer: input.buffer,
      mimeType: 'application/octet-stream',
    });

    session.partCount = partNumber;
    session.uploadedBytes = nextBytes;
    session.lockedAt = undefined;
    await session.save();

    if (session.uploadedBytes < session.totalSize) {
      return {
        complete: false as const,
        uploadedBytes: session.uploadedBytes,
        totalSize: session.totalSize,
      };
    }

    return finalizeUploadSession(session);
  } catch (error) {
    await releaseUploadLock(session._id);
    throw error;
  }
}

export async function initPublicPhotoUpload(
  slug: string,
  input: { fileName: string; mimeType: string; size: number }
) {
  const gallery = await getPublishedGalleryBySlug(slug);
  return initPhotoUpload({
    ownerUserId: gallery.userId.toString(),
    galleryId: gallery._id.toString(),
    fileName: input.fileName,
    mimeType: input.mimeType,
    size: input.size,
    requirePublished: true,
  });
}

export async function getOwnedPhoto(userId: string, photoId: string) {
  if (!Types.ObjectId.isValid(photoId)) return null;
  return Photo.findOne({
    _id: new Types.ObjectId(photoId),
    userId: new Types.ObjectId(userId),
  });
}

export async function deleteOwnedPhoto(userId: string, photoId: string) {
  const photo = await getOwnedPhoto(userId, photoId);
  if (!photo) throw new Error('Foto não encontrada.');

  if (photo.thumbnailKey) {
    await deleteStoredObject(photo.thumbnailKey);
  }
  if (photo.storageKey) {
    const removed = await deleteStoredObject(photo.storageKey);
    if (!removed) {
      throw new Error('Não foi possível apagar o arquivo no armazenamento. Tente novamente.');
    }
  }

  await Photo.deleteOne({
    _id: photo._id,
    userId: new Types.ObjectId(userId),
  });

  return { id: photo._id.toString(), size: photo.size };
}

export function zipBudgetError(photoCount: number, totalBytes: number) {
  if (photoCount > platformConfig.zipMaxPhotos) {
    return `Você pode baixar no máximo ${platformConfig.zipMaxPhotos} fotos por ZIP.`;
  }
  if (totalBytes > platformConfig.zipMaxTotalBytes) {
    const maxMb = Math.round(platformConfig.zipMaxTotalBytes / 1024 / 1024);
    return `O ZIP ficaria grande demais. Selecione menos fotos (máximo ${maxMb} MB).`;
  }
  return null;
}

export function zipFileName(title: string) {
  const slug = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'galeria'}-fotos.zip`;
}

function appendZipEntry(
  archive: ZipArchive,
  stream: NodeJS.ReadableStream,
  name: string
) {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      stream.removeListener('end', onEnd);
      reject(error);
    };
    const onEnd = () => {
      stream.removeListener('error', onError);
      resolve();
    };
    stream.once('error', onError);
    stream.once('end', onEnd);
    archive.append(stream as Readable, { name });
  });
}

export async function buildOwnedGalleryZip(input: {
  userId: string;
  galleryId: string;
  photoIds: string[];
}) {
  const { gallery, photos } = await getOwnedPhotosForZip(input);
  const totalBytes = photos.reduce((sum, photo) => sum + (photo.size ?? 0), 0);
  const budgetError = zipBudgetError(photos.length, totalBytes);
  if (budgetError) throw new Error(budgetError);

  const storageKey = buildZipStorageKey(input.userId, gallery._id.toString());
  const fileName = zipFileName(gallery.title);
  const entryNames = uniqueZipEntryNames(photos.map((photo) => photo.fileName));
  const zipStream = new PassThrough();
  const archive = new ZipArchive({ zlib: { level: 1 } });
  zipStream.on('error', () => {
    // Evita uncaughtException se o R2 recusar o stream.
  });
  archive.on('error', (error: Error) => {
    zipStream.destroy(error);
  });
  archive.pipe(zipStream);

  const uploaded = startFileStreamUpload({
    storageKey,
    body: zipStream,
    mimeType: 'application/zip',
  });
  const uploadDone = uploaded.done();
  uploadDone.catch(() => undefined);

  const deadline = Date.now() + platformConfig.zipBuildDeadlineMs;
  const startedAt = Date.now();

  try {
    for (let index = 0; index < photos.length; index += 1) {
      if (Date.now() > deadline) {
        throw new Error(
          'A geração do ZIP demorou demais. Selecione menos fotos e tente novamente.'
        );
      }
      const photo = photos[index]!;
      if (!photo.storageKey) {
        throw new Error('Foto sem arquivo no armazenamento.');
      }
      const file = await openStoredFile(photo.storageKey);
      await appendZipEntry(archive, file.stream, entryNames[index]!);
    }
    await archive.finalize();
    await uploadDone;
  } catch (error) {
    archive.abort();
    zipStream.destroy();
    try {
      await uploaded.abort();
    } catch {
      // ignore abort
    }
    try {
      await deleteFile(storageKey);
    } catch {
      // órfão será limpo pelo cron de tmp/zips
    }
    opsLog(
      'zip_failed',
      {
        galleryId: input.galleryId,
        photoCount: photos.length,
        totalBytes,
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : 'zip_error',
      },
      'error'
    );
    throw error;
  }

  const expiresInSeconds = 15 * 60;
  const downloadUrl = await getSignedDownloadUrl(
    storageKey,
    expiresInSeconds,
    fileName
  );

  opsLog('zip_built', {
    galleryId: input.galleryId,
    photoCount: photos.length,
    totalBytes,
    durationMs: Date.now() - startedAt,
  });

  return {
    downloadUrl,
    fileName,
    photoCount: photos.length,
    totalBytes,
    expiresInSeconds,
  };
}

export function uniqueZipEntryNames(fileNames: string[]) {
  const used = new Map<string, number>();
  return fileNames.map((raw) => {
    const name = raw.trim() || 'foto.jpg';
    const count = (used.get(name) ?? 0) + 1;
    used.set(name, count);
    if (count === 1) return name;
    const dot = name.lastIndexOf('.');
    if (dot <= 0) return `${name}-${count}`;
    return `${name.slice(0, dot)}-${count}${name.slice(dot)}`;
  });
}

export async function getOwnedPhotosForZip(input: {
  userId: string;
  galleryId: string;
  photoIds: string[];
}) {
  const gallery = await ownedGallery(input.userId, input.galleryId);
  const uniqueIds = [...new Set(input.photoIds.filter(Boolean))];

  if (uniqueIds.length === 0) {
    throw new Error('Selecione ao menos uma foto.');
  }
  if (uniqueIds.length > platformConfig.zipMaxPhotos) {
    throw new Error(
      `Você pode baixar no máximo ${platformConfig.zipMaxPhotos} fotos por ZIP.`
    );
  }

  const objectIds = uniqueIds
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

  if (objectIds.length === 0) {
    throw new Error('Nenhuma foto válida selecionada.');
  }

  const photos = await Photo.find({
    userId: new Types.ObjectId(input.userId),
    galleryId: new Types.ObjectId(input.galleryId),
    _id: { $in: objectIds },
  });

  if (photos.length === 0) {
    throw new Error('Nenhuma foto encontrada.');
  }

  const byId = new Map(photos.map((photo) => [photo._id.toString(), photo]));
  const ordered = uniqueIds
    .map((id) => byId.get(id))
    .filter((photo): photo is NonNullable<typeof photo> => Boolean(photo));

  return { gallery, photos: ordered };
}

export async function getUserPhotoStats(userId: string) {
  const [usage] = await Photo.aggregate<{ count: number; totalBytes: number }>([
    { $match: { userId: new Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        totalBytes: { $sum: '$size' },
      },
    },
  ]);
  return {
    count: usage?.count ?? 0,
    totalBytes: usage?.totalBytes ?? 0,
    maxStorageBytes: platformConfig.maxStorageBytes,
    maxPhotoBytes: platformConfig.maxPhotoBytes,
  };
}
