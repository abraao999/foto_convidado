import crypto from 'node:crypto';
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
  buildPhotoStorageKey,
  buildUploadPartKey,
  deleteFile,
  getObjectStream,
  uploadFile,
} from './r2.service.js';
import { canAcceptGalleryUploads } from './subscription.service.js';
import { streamToBuffer } from '../utils/image-preview.js';

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

export function serializePhoto(photo: IPhotoDocument) {
  const id = photo._id.toString();
  const isHeic =
    photo.mimeType === 'image/heic' ||
    photo.mimeType === 'image/heif' ||
    /\.heic$|\.heif$/i.test(photo.fileName);
  const previewQuery = isHeic ? '&format=jpeg' : '';
  return {
    id,
    galleryId: photo.galleryId.toString(),
    fileName: photo.fileName,
    thumbnailUrl: `/api/photos/${id}/content?v=${photo.updatedAt.getTime()}${previewQuery}`,
    mimeType: photo.mimeType,
    size: photo.size,
    createdAt: photo.createdAt,
  };
}

export function hasValidImageSignature(file: PhotoUpload) {
  const bytes = file.buffer;
  const isJpeg =
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
  const isPng =
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  const isWebp =
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  const heicBrand =
    bytes.length >= 12 ? bytes.subarray(8, 12).toString('ascii') : '';
  const isHeic =
    bytes.length >= 12 &&
    bytes.subarray(4, 8).toString('ascii') === 'ftyp' &&
    ['heic', 'heix', 'hevc', 'hevx', 'mif1'].includes(heicBrand);
  return isJpeg || isPng || isWebp || isHeic;
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

export async function listGalleryPhotos(userId: string, galleryId: string) {
  await ownedGallery(userId, galleryId);
  return Photo.find({
    userId: new Types.ObjectId(userId),
    galleryId: new Types.ObjectId(galleryId),
  }).sort({ createdAt: -1 });
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
    expiresAt,
  });

  return { sessionToken: token, chunkSize: platformConfig.uploadChunkBytes };
}

export async function uploadPhotoChunk(input: {
  sessionToken: string;
  buffer: Buffer;
}) {
  const session = await UploadSession.findOne({
    token: input.sessionToken,
    expiresAt: { $gt: new Date() },
    completedStorageKey: { $exists: false },
  });
  if (!session?.storageKey) {
    throw new Error('Sessão de envio inválida ou expirada.');
  }

  if (
    session.uploadedBytes === 0 &&
    !hasValidImageSignature({
      originalname: session.fileName,
      mimetype: session.mimeType,
      size: session.totalSize,
      buffer: input.buffer,
    })
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

  if (session.uploadedBytes < session.totalSize) {
    await session.save();
    return {
      complete: false as const,
      uploadedBytes: session.uploadedBytes,
      totalSize: session.totalSize,
    };
  }

  const partBuffers: Buffer[] = [];
  for (let part = 1; part <= session.partCount; part += 1) {
    const partKey = buildUploadPartKey(session.token, part);
    const partFile = await getObjectStream(partKey);
    partBuffers.push(await streamToBuffer(partFile.stream));
  }

  const fullBuffer = Buffer.concat(partBuffers);
  if (fullBuffer.length !== session.totalSize) {
    throw new Error('O arquivo montado não corresponde ao tamanho esperado.');
  }

  await uploadFile({
    storageKey: session.storageKey,
    buffer: fullBuffer,
    mimeType: session.mimeType,
  });

  // Confirma que o objeto final existe antes de gravar no MongoDB.
  await getObjectStream(session.storageKey);

  for (let part = 1; part <= session.partCount; part += 1) {
    try {
      await deleteFile(buildUploadPartKey(session.token, part));
    } catch (error) {
      console.warn('Falha ao limpar parte temporária do R2:', error);
    }
  }

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

  session.completedStorageKey = session.storageKey;
  await session.save();

  return {
    complete: true as const,
    photo: serializePhoto(photo),
  };
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

const MAX_ZIP_PHOTOS = 100;

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
  if (uniqueIds.length > MAX_ZIP_PHOTOS) {
    throw new Error(
      `Você pode baixar no máximo ${MAX_ZIP_PHOTOS} fotos por ZIP.`
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
