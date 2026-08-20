import 'dotenv/config';
import mongoose from 'mongoose';
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import {
  buildAvatarStorageKey,
  buildCoverStorageKey,
  buildPhotoStorageKey,
  uploadFile,
} from '../server/services/r2.service.js';
import { streamToBuffer } from '../server/utils/image-preview.js';

function createDrive() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Credenciais do Google Drive ausentes no .env (ainda necessárias para migrar).');
  }
  const oauth = new google.auth.OAuth2(clientId, clientSecret);
  oauth.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth });
}

async function downloadDrive(fileId: string) {
  const drive = createDrive();
  const [meta, media] = await Promise.all([
    drive.files.get({ fileId, fields: 'mimeType,name' }),
    drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' }),
  ]);
  const buffer = await streamToBuffer(media.data as Readable);
  return {
    buffer,
    mimeType: meta.data.mimeType ?? 'application/octet-stream',
    name: meta.data.name ?? 'file',
  };
}

function isR2Key(value?: string | null) {
  return Boolean(value && value.includes('/'));
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;

  let migratedPhotos = 0;
  let skippedPhotos = 0;
  let failedPhotos = 0;

  const photos = await db
    .collection('photos')
    .find({
      driveFileId: { $type: 'string' },
      $or: [{ storageKey: { $exists: false } }, { storageKey: null }, { storageKey: '' }],
    })
    .toArray();

  console.log(`Fotos legadas no Drive: ${photos.length}`);

  for (const photo of photos) {
    const driveFileId = String(photo.driveFileId);
    try {
      const file = await downloadDrive(driveFileId);
      const storageKey = buildPhotoStorageKey(
        String(photo.galleryId),
        String(photo.fileName || file.name),
        String(photo.mimeType || file.mimeType)
      );
      await uploadFile({
        storageKey,
        buffer: file.buffer,
        mimeType: String(photo.mimeType || file.mimeType),
      });
      await db.collection('photos').updateOne(
        { _id: photo._id },
        {
          $set: { storageKey },
          // Mantém driveFileId no documento (cópia); não apaga no Drive.
        }
      );
      migratedPhotos += 1;
      console.log(`OK foto ${photo._id} → ${storageKey}`);
    } catch (error) {
      failedPhotos += 1;
      console.error(`FALHA foto ${photo._id}:`, error);
    }
  }

  const galleries = await db
    .collection('galleries')
    .find({ coverPhoto: { $type: 'string' } })
    .toArray();

  let migratedCovers = 0;
  for (const gallery of galleries) {
    const cover = String(gallery.coverPhoto);
    if (isR2Key(cover)) {
      skippedPhotos += 1;
      continue;
    }
    try {
      const file = await downloadDrive(cover);
      const storageKey = buildCoverStorageKey(
        String(gallery._id),
        file.name,
        file.mimeType
      );
      await uploadFile({
        storageKey,
        buffer: file.buffer,
        mimeType: file.mimeType,
      });
      await db.collection('galleries').updateOne(
        { _id: gallery._id },
        { $set: { coverPhoto: storageKey } }
      );
      migratedCovers += 1;
      console.log(`OK capa ${gallery._id} → ${storageKey}`);
    } catch (error) {
      console.error(`FALHA capa ${gallery._id}:`, error);
    }
  }

  const users = await db
    .collection('users')
    .find({
      avatarDriveFileId: { $type: 'string' },
      $or: [
        { avatarStorageKey: { $exists: false } },
        { avatarStorageKey: null },
        { avatarStorageKey: '' },
      ],
    })
    .toArray();

  let migratedAvatars = 0;
  for (const user of users) {
    try {
      const file = await downloadDrive(String(user.avatarDriveFileId));
      const storageKey = buildAvatarStorageKey(
        String(user._id),
        file.name,
        file.mimeType
      );
      await uploadFile({
        storageKey,
        buffer: file.buffer,
        mimeType: file.mimeType,
      });
      await db.collection('users').updateOne(
        { _id: user._id },
        {
          $set: { avatarStorageKey: storageKey, avatarUrl: '/api/profile/avatar' },
        }
      );
      migratedAvatars += 1;
      console.log(`OK avatar ${user._id} → ${storageKey}`);
    } catch (error) {
      console.error(`FALHA avatar ${user._id}:`, error);
    }
  }

  console.log('\nResumo:');
  console.log(`Fotos migradas: ${migratedPhotos}`);
  console.log(`Fotos com falha: ${failedPhotos}`);
  console.log(`Capas migradas: ${migratedCovers}`);
  console.log(`Avatares migrados: ${migratedAvatars}`);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
