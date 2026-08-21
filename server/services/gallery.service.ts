import { Types } from 'mongoose';
import { platformConfig } from '../config/platform.js';
import {
  Gallery,
  type IGalleryDocument,
} from '../models/Gallery.js';
import { normalizeSlug } from './profile.service.js';
import { hasValidImageSignature } from '../utils/image-signature.js';
import {
  buildCoverStorageKey,
  deleteFile,
  isR2StorageKey,
  uploadFile,
} from './r2.service.js';

export interface CreateGalleryInput {
  title: string;
  description?: string;
  slug?: string;
  eventDate?: Date;
  location?: string;
}

export type UpdateGalleryInput = CreateGalleryInput;

export function serializeGallery(gallery: IGalleryDocument) {
  const id = gallery._id.toString();
  return {
    id,
    userId: gallery.userId.toString(),
    title: gallery.title,
    description: gallery.description,
    slug: gallery.slug,
    coverPhoto: gallery.coverPhoto
      ? `/api/galleries/${id}/cover?v=${gallery.updatedAt.getTime()}`
      : undefined,
    eventDate: gallery.eventDate,
    location: gallery.location,
    status: gallery.status,
    createdAt: gallery.createdAt,
    updatedAt: gallery.updatedAt,
  };
}

export async function listUserGalleries(userId: string) {
  return Gallery.find({ userId: new Types.ObjectId(userId) }).sort({
    createdAt: -1,
  });
}

export async function createGallery(
  userId: string,
  input: CreateGalleryInput
) {
  const count = await Gallery.countDocuments({
    userId: new Types.ObjectId(userId),
    status: { $ne: 'ARCHIVED' },
  });
  if (count >= platformConfig.maxGalleries) {
    throw new Error(
      `Seu acesso permite até ${platformConfig.maxGalleries} galeria(s).`
    );
  }

  const baseSlug = normalizeSlug(input.slug || input.title);
  if (!baseSlug) throw new Error('Informe um endereço público válido.');

  const duplicate = await Gallery.exists({ slug: baseSlug });
  if (duplicate) {
    throw new Error('Este endereço público já está em uso.');
  }

  return Gallery.create({
    userId: new Types.ObjectId(userId),
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    slug: baseSlug,
    eventDate: input.eventDate,
    location: input.location?.trim() || undefined,
    status: 'DRAFT',
  });
}

async function findOwnedGallery(userId: string, galleryId: string) {
  if (!Types.ObjectId.isValid(galleryId)) {
    throw new Error('Galeria não encontrada.');
  }
  const gallery = await Gallery.findOne({
    _id: new Types.ObjectId(galleryId),
    userId: new Types.ObjectId(userId),
  });
  if (!gallery) throw new Error('Galeria não encontrada.');
  return gallery;
}

export async function updateGallery(
  userId: string,
  galleryId: string,
  input: UpdateGalleryInput
) {
  const gallery = await findOwnedGallery(userId, galleryId);
  if (gallery.status === 'ARCHIVED') {
    throw new Error('Uma galeria arquivada não pode ser editada.');
  }

  const slug = normalizeSlug(input.slug || input.title);
  if (!slug) throw new Error('Informe um endereço público válido.');
  const duplicate = await Gallery.exists({
    slug,
    _id: { $ne: gallery._id },
  });
  if (duplicate) throw new Error('Este endereço público já está em uso.');

  gallery.title = input.title.trim();
  gallery.description = input.description?.trim() || undefined;
  gallery.slug = slug;
  gallery.eventDate = input.eventDate;
  gallery.location = input.location?.trim() || undefined;
  return gallery.save();
}

export async function setGalleryPublication(
  userId: string,
  galleryId: string,
  published: boolean
) {
  const gallery = await findOwnedGallery(userId, galleryId);
  if (gallery.status === 'ARCHIVED') {
    throw new Error('Uma galeria arquivada não pode ser publicada.');
  }
  gallery.status = published ? 'PUBLISHED' : 'DRAFT';
  return gallery.save();
}

export async function archiveGallery(userId: string, galleryId: string) {
  const gallery = await findOwnedGallery(userId, galleryId);
  gallery.status = 'ARCHIVED';
  return gallery.save();
}

export async function replaceGalleryCover(
  userId: string,
  galleryId: string,
  file: { originalname: string; mimetype: string; buffer: Buffer }
) {
  const gallery = await findOwnedGallery(userId, galleryId);
  if (gallery.status === 'ARCHIVED') {
    throw new Error('Uma galeria arquivada não pode ser editada.');
  }

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  if (!allowed.includes(file.mimetype) || !hasValidImageSignature(file)) {
    throw new Error('Escolha uma imagem JPG, PNG, WebP ou HEIC de até 8 MB.');
  }

  const storageKey = buildCoverStorageKey(
    galleryId,
    file.originalname,
    file.mimetype
  );
  await uploadFile({
    storageKey,
    buffer: file.buffer,
    mimeType: file.mimetype,
  });

  const previous = gallery.coverPhoto;
  gallery.coverPhoto = storageKey;
  await gallery.save();

  if (previous && previous !== storageKey && isR2StorageKey(previous)) {
    try {
      await deleteFile(previous);
    } catch (error) {
      console.warn(`Falha ao apagar capa anterior no R2 (${previous}):`, error);
    }
  }

  return gallery;
}

export async function getOwnedGalleryCover(userId: string, galleryId: string) {
  const gallery = await findOwnedGallery(userId, galleryId);
  if (!gallery.coverPhoto) throw new Error('Esta galeria ainda não tem foto de capa.');
  return gallery.coverPhoto;
}

export async function getPublishedGalleryBySlug(slug: string) {
  const gallery = await Gallery.findOne({
    slug: slug.toLowerCase().trim(),
    status: 'PUBLISHED',
  });
  if (!gallery) throw new Error('Galeria não encontrada ou indisponível.');
  return gallery;
}

export function serializePublicGallery(gallery: IGalleryDocument) {
  return {
    title: gallery.title,
    description: gallery.description,
    slug: gallery.slug,
    eventDate: gallery.eventDate,
    location: gallery.location,
    coverUrl: gallery.coverPhoto
      ? `/api/public/galleries/${gallery.slug}/cover?v=${gallery.updatedAt.getTime()}`
      : undefined,
    uploadUrl: `/galeria/${gallery.slug}/enviar`,
  };
}
