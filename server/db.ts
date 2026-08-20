import mongoose from 'mongoose';
import { ensurePhotoIndexes } from './utils/ensure-photo-indexes.js';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  indexesReady: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache ?? {
  conn: null,
  promise: null,
  indexesReady: false,
};
global.mongooseCache = cached;

export async function connectDB(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI não está configurada.');

  if (cached.conn) {
    if (!cached.indexesReady) {
      await ensurePhotoIndexes(cached.conn.connection);
      cached.indexesReady = true;
    }
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, { bufferCommands: false });
  }

  cached.conn = await cached.promise;
  if (!cached.indexesReady) {
    await ensurePhotoIndexes(cached.conn.connection);
    cached.indexesReady = true;
  }
  return cached.conn;
}
