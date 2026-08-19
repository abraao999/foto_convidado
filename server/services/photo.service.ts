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
  createResumableGalleryUpload,
  makeDriveFilePublic,
  uploadResumableChunk,
} from './google-drive.service.js';
import { canAcceptGalleryUploads } from './subscription.service.js';

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
  return {
    id: photo._id.toString(),
    galleryId: photo.galleryId.toString(),
    fileName: photo.fileName,
    thumbnailUrl: `/api/photos/${photo._id.toString()}/content?v=${photo.updatedAt.getTime()}`,
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

export async function getPublicGalleryUploadInfo(slug: string) {
  const gallery = await getPublishedGalleryBySlug(slug);
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

  const { uploadUrl } = await createResumableGalleryUpload({
    userId: input.ownerUserId,
    galleryId: input.galleryId,
    mimeType: input.mimeType,
    originalName: input.fileName,
    size: input.size,
  });

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await UploadSession.create({
    token,
    userId: new Types.ObjectId(input.ownerUserId),
    galleryId: new Types.ObjectId(input.galleryId),
    uploadUrl,
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
    driveFileId: { $exists: false },
  });
  if (!session) throw new Error('Sessão de envio inválida ou expirada.');

  if (session.uploadedBytes === 0 && !hasValidImageSignature({
    originalname: session.fileName,
    mimetype: session.mimeType,
    size: session.totalSize,
    buffer: input.buffer,
  })) {
    throw new Error('O arquivo não contém uma imagem válida.');
  }

  const result = await uploadResumableChunk({
    uploadUrl: session.uploadUrl,
    buffer: input.buffer,
    start: session.uploadedBytes,
    total: session.totalSize,
    mimeType: session.mimeType,
  });

  session.uploadedBytes += input.buffer.length;

  if (!result.complete) {
    await session.save();
    return {
      complete: false as const,
      uploadedBytes: session.uploadedBytes,
      totalSize: session.totalSize,
    };
  }

  await makeDriveFilePublic(result.fileId);
  const photo = await Photo.create({
    userId: session.userId,
    galleryId: session.galleryId,
    fileName: session.fileName,
    driveFileId: result.fileId,
    thumbnailUrl: `https://drive.google.com/thumbnail?id=${encodeURIComponent(result.fileId)}&sz=w1200`,
    mimeType: session.mimeType,
    size: session.totalSize,
  });

  session.driveFileId = result.fileId;
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
