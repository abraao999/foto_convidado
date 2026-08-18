import { Types } from 'mongoose';
import { platformConfig } from '../config/platform.js';
import {
  Gallery,
  type IGalleryDocument,
} from '../models/Gallery.js';
import { normalizeSlug } from './profile.service.js';

export interface CreateGalleryInput {
  title: string;
  description?: string;
  slug?: string;
  eventDate?: Date;
  location?: string;
}

export function serializeGallery(gallery: IGalleryDocument) {
  return {
    id: gallery._id.toString(),
    userId: gallery.userId.toString(),
    title: gallery.title,
    description: gallery.description,
    slug: gallery.slug,
    coverPhoto: gallery.coverPhoto,
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
