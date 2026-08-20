import type { Connection } from 'mongoose';

/**
 * O índice antigo driveFileId_1 era unique sem sparse.
 * Com fotos no R2 (sem driveFileId), vários nulls geravam E11000.
 * Nunca deve derrubar a API se a migração de índice falhar.
 */
export async function ensurePhotoIndexes(connection: Connection) {
  try {
    const collection = connection.collection('photos');
    const indexes = await collection.indexes();

    const driveIndex = indexes.find((index) => index.name === 'driveFileId_1');
    if (driveIndex && !driveIndex.sparse) {
      await collection.dropIndex('driveFileId_1');
      console.info('Índice driveFileId_1 antigo removido (sem sparse).');
    }

    const storageIndex = indexes.find((index) => index.name === 'storageKey_1');
    if (storageIndex && !storageIndex.sparse) {
      await collection.dropIndex('storageKey_1');
      console.info('Índice storageKey_1 antigo removido (sem sparse).');
    }

    await collection.updateMany(
      { driveFileId: null },
      { $unset: { driveFileId: '' } }
    );
    await collection.updateMany(
      { storageKey: null },
      { $unset: { storageKey: '' } }
    );

    await collection.createIndex(
      { driveFileId: 1 },
      { unique: true, sparse: true, name: 'driveFileId_1' }
    );
    await collection.createIndex(
      { storageKey: 1 },
      { unique: true, sparse: true, name: 'storageKey_1' }
    );
  } catch (error) {
    console.error('Aviso: não foi possível ajustar índices de photos:', error);
  }
}
