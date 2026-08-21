import { Types } from 'mongoose';
import { platformConfig } from '../config/platform.js';
import { Gallery } from '../models/Gallery.js';
import { Photo } from '../models/Photo.js';
import { Subscription } from '../models/Subscription.js';
import { User } from '../models/User.js';
import { deleteFile, isR2StorageKey } from './r2.service.js';

function graceEndDate(expiresAt: Date) {
  const end = new Date(expiresAt);
  end.setDate(end.getDate() + platformConfig.publicGalleryGraceDays);
  return end;
}

export function daysUntilMediaPurge(expiresAt: Date, now = new Date()) {
  const end = graceEndDate(expiresAt);
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function isPastMediaGrace(expiresAt: Date, now = new Date()) {
  return now.getTime() > graceEndDate(expiresAt).getTime();
}

/**
 * Remove do R2 e do Mongo todas as fotos/capas de um usuário.
 * Avatar de perfil é preservado.
 */
export async function deleteUserGalleryMedia(userId: string) {
  if (!Types.ObjectId.isValid(userId)) {
    throw new Error('Usuário inválido.');
  }

  const ownerId = new Types.ObjectId(userId);
  const photos = await Photo.find({ userId: ownerId }).select('storageKey');
  let deletedPhotos = 0;
  let deletedCovers = 0;

  for (const photo of photos) {
    if (photo.storageKey) {
      try {
        await deleteFile(photo.storageKey);
      } catch (error) {
        console.warn(`Falha ao apagar foto no R2 (${photo.storageKey}):`, error);
      }
    }
  }
  if (photos.length > 0) {
    const result = await Photo.deleteMany({ userId: ownerId });
    deletedPhotos = result.deletedCount ?? 0;
  }

  const galleries = await Gallery.find({ userId: ownerId });
  for (const gallery of galleries) {
    if (gallery.coverPhoto && isR2StorageKey(gallery.coverPhoto)) {
      try {
        await deleteFile(gallery.coverPhoto);
        deletedCovers += 1;
      } catch (error) {
        console.warn(`Falha ao apagar capa no R2 (${gallery.coverPhoto}):`, error);
      }
    }
    gallery.coverPhoto = undefined;
    if (gallery.status !== 'ARCHIVED') {
      gallery.status = 'ARCHIVED';
    }
    await gallery.save();
  }

  await User.findByIdAndUpdate(ownerId, { $set: { mediaPurgedAt: new Date() } });

  return { deletedPhotos, deletedCovers, archivedGalleries: galleries.length };
}

async function userNeedsMediaPurge(userId: Types.ObjectId, now: Date) {
  const user = await User.findById(userId).select('role mediaPurgedAt');
  if (!user || user.role === 'ADMIN') return false;

  const active = await Subscription.findOne({
    userId,
    status: 'ACTIVE',
    expiresAt: { $gt: now },
  });
  if (active) return false;

  const last = await Subscription.findOne({ userId }).sort({ expiresAt: -1 });
  if (!last?.expiresAt) return false;
  if (!isPastMediaGrace(last.expiresAt, now)) return false;

  // Já limpou depois deste vencimento.
  if (user.mediaPurgedAt && user.mediaPurgedAt >= last.expiresAt) {
    return false;
  }

  const hasPhotos = await Photo.exists({ userId });
  const hasCover = await Gallery.exists({
    userId,
    coverPhoto: { $type: 'string', $ne: '' },
  });
  return Boolean(hasPhotos || hasCover);
}

/**
 * Limpa mídia de usuários cuja assinatura já passou da carência.
 * Processa em lotes pequenos para caber em requests serverless.
 */
export async function purgeExpiredUserMedia(options?: { limit?: number }) {
  const limit = Math.max(1, Math.min(options?.limit ?? 5, 20));
  const now = new Date();

  const candidates = await Subscription.aggregate<{ _id: Types.ObjectId }>([
    { $match: { expiresAt: { $type: 'date' } } },
    { $sort: { expiresAt: -1 } },
    {
      $group: {
        _id: '$userId',
        lastExpiresAt: { $first: '$expiresAt' },
      },
    },
    {
      $match: {
        lastExpiresAt: {
          $lte: new Date(
            now.getTime() -
              platformConfig.publicGalleryGraceDays * 24 * 60 * 60 * 1000
          ),
        },
      },
    },
    { $limit: limit * 5 },
  ]);

  const purged: Array<{
    userId: string;
    deletedPhotos: number;
    deletedCovers: number;
  }> = [];

  for (const candidate of candidates) {
    if (purged.length >= limit) break;
    const needs = await userNeedsMediaPurge(candidate._id, now);
    if (!needs) continue;

    const result = await deleteUserGalleryMedia(candidate._id.toString());
    purged.push({
      userId: candidate._id.toString(),
      deletedPhotos: result.deletedPhotos,
      deletedCovers: result.deletedCovers,
    });
    console.info(
      `[media-cleanup] user=${candidate._id} photos=${result.deletedPhotos} covers=${result.deletedCovers}`
    );
  }

  return {
    checked: candidates.length,
    purgedUsers: purged.length,
    details: purged,
  };
}
