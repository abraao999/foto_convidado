import { Types } from 'mongoose';
import { platformConfig } from '../config/platform.js';
import { Gallery } from '../models/Gallery.js';
import { Photo } from '../models/Photo.js';
import { Subscription } from '../models/Subscription.js';
import { User } from '../models/User.js';
import {
  cleanupExpiredUploadParts,
  deleteStoredObject,
  isR2StorageKey,
} from './r2.service.js';

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
 * Remove do R2 e do Mongo fotos/capas de um usuário.
 * Só apaga o registro no Mongo depois que o objeto saiu do R2.
 * Avatar de perfil é preservado.
 * Se algum delete no R2 falhar, não marca mediaPurgedAt (o cron tenta de novo).
 */
export async function deleteUserGalleryMedia(userId: string) {
  if (!Types.ObjectId.isValid(userId)) {
    throw new Error('Usuário inválido.');
  }

  const ownerId = new Types.ObjectId(userId);
  const photos = await Photo.find({ userId: ownerId }).select(
    'storageKey thumbnailKey'
  );
  let deletedPhotos = 0;
  let deletedCovers = 0;
  let failedObjects = 0;

  for (const photo of photos) {
    if (photo.thumbnailKey) {
      await deleteStoredObject(photo.thumbnailKey);
    }
    if (photo.storageKey) {
      const removed = await deleteStoredObject(photo.storageKey);
      if (!removed) {
        failedObjects += 1;
        continue;
      }
    }
    await Photo.deleteOne({ _id: photo._id });
    deletedPhotos += 1;
  }

  const galleries = await Gallery.find({ userId: ownerId });
  for (const gallery of galleries) {
    if (gallery.coverPhoto && isR2StorageKey(gallery.coverPhoto)) {
      const removed = await deleteStoredObject(gallery.coverPhoto);
      if (!removed) {
        failedObjects += 1;
        continue;
      }
      deletedCovers += 1;
      gallery.coverPhoto = undefined;
    } else if (gallery.coverPhoto) {
      gallery.coverPhoto = undefined;
    }
    if (gallery.status !== 'ARCHIVED') {
      gallery.status = 'ARCHIVED';
    }
    await gallery.save();
  }

  const incomplete = failedObjects > 0;
  if (!incomplete) {
    await User.findByIdAndUpdate(ownerId, { $set: { mediaPurgedAt: new Date() } });
  } else {
    console.warn(
      `[media-cleanup] limpeza incompleta user=${userId} failedObjects=${failedObjects}`
    );
  }

  return {
    deletedPhotos,
    deletedCovers,
    archivedGalleries: galleries.length,
    failedObjects,
    incomplete,
  };
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
 * Processa em lotes para caber em requests serverless.
 */
export async function purgeExpiredUserMedia(options?: { limit?: number }) {
  const limit = Math.max(1, Math.min(options?.limit ?? 5, 20));
  const now = new Date();
  const graceMs = platformConfig.publicGalleryGraceDays * 24 * 60 * 60 * 1000;

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
        lastExpiresAt: { $lte: new Date(now.getTime() - graceMs) },
      },
    },
    { $sort: { lastExpiresAt: 1 } },
    { $limit: limit * 5 },
  ]);

  const purged: Array<{
    userId: string;
    deletedPhotos: number;
    deletedCovers: number;
    incomplete: boolean;
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
      incomplete: result.incomplete,
    });
    console.info(
      `[media-cleanup] user=${candidate._id} photos=${result.deletedPhotos} covers=${result.deletedCovers} incomplete=${result.incomplete}`
    );
  }

  return {
    checked: candidates.length,
    purgedUsers: purged.length,
    incompleteUsers: purged.filter((item) => item.incomplete).length,
    deletedPhotos: purged.reduce((sum, item) => sum + item.deletedPhotos, 0),
    deletedCovers: purged.reduce((sum, item) => sum + item.deletedCovers, 0),
    details: purged,
  };
}

export async function expireDueSubscriptions() {
  const result = await Subscription.updateMany(
    { status: 'ACTIVE', expiresAt: { $lte: new Date() } },
    { $set: { status: 'EXPIRED' } }
  );
  return result.modifiedCount;
}

/** Job diário: expira assinaturas, apaga mídia fora da carência e limpa tmp do R2. */
export async function runScheduledCleanup(options?: { limit?: number }) {
  const expiredSubscriptions = await expireDueSubscriptions();
  const purge = await purgeExpiredUserMedia({
    limit: options?.limit ?? 20,
  });

  let tmpPartsDeleted = 0;
  try {
    const tmp = await cleanupExpiredUploadParts();
    tmpPartsDeleted = tmp.deleted;
  } catch (error) {
    console.error('Falha ao limpar partes temporárias de upload:', error);
  }

  return {
    expiredSubscriptions,
    tmpPartsDeleted,
    ...purge,
  };
}
