import type { Connection } from 'mongoose';

/**
 * Garante índices do R2 e remove resíduos da era Google Drive.
 * Nunca deve derrubar a API se a migração de índice falhar.
 */
export async function ensurePhotoIndexes(connection: Connection) {
  try {
    const photos = connection.collection('photos');
    const users = connection.collection('users');
    const sessions = connection.collection('uploadsessions');

    const indexes = await photos.indexes();
    const driveIndex = indexes.find((index) => index.name === 'driveFileId_1');
    if (driveIndex) {
      await photos.dropIndex('driveFileId_1');
      console.info('Índice legado driveFileId_1 removido.');
    }

    await photos.updateMany({}, { $unset: { driveFileId: '' } });
    await users.updateMany({}, { $unset: { avatarDriveFileId: '' } });
    await sessions.updateMany(
      {},
      { $unset: { driveFileId: '', uploadUrl: '' } }
    );

    await photos.createIndex(
      { storageKey: 1 },
      { unique: true, sparse: true, name: 'storageKey_1' }
    );
  } catch (error) {
    console.error('Aviso: não foi possível ajustar índices de photos:', error);
  }
}
