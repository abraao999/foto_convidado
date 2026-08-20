import mongoose, {
  Schema,
  Types,
  type Document,
  type Model,
} from 'mongoose';

export interface IPhoto {
  userId: Types.ObjectId;
  galleryId: Types.ObjectId;
  fileName: string;
  /** Legado Google Drive — histórico após migração. */
  driveFileId?: string;
  /** Chave no Cloudflare R2. */
  storageKey: string;
  thumbnailUrl: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPhotoDocument extends IPhoto, Document {}

const photoSchema = new Schema<IPhotoDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    galleryId: {
      type: Schema.Types.ObjectId,
      ref: 'Gallery',
      required: true,
      index: true,
    },
    fileName: { type: String, required: true, trim: true, maxlength: 255 },
    /** Legado — mantido só para histórico após migração Drive → R2. */
    driveFileId: { type: String, maxlength: 255 },
    storageKey: { type: String, required: true, maxlength: 512 },
    thumbnailUrl: { type: String, required: true, maxlength: 2048 },
    mimeType: { type: String, required: true, maxlength: 100 },
    size: { type: Number, required: true, min: 1 },
  },
  { timestamps: true }
);

photoSchema.index({ driveFileId: 1 }, { unique: true, sparse: true });
photoSchema.index({ storageKey: 1 }, { unique: true, sparse: true });
photoSchema.index({ galleryId: 1, createdAt: -1 });
photoSchema.index({ userId: 1, createdAt: -1 });

photoSchema.pre('validate', function ensureStorageKey(next) {
  if (!this.storageKey) {
    next(new Error('A foto precisa de storageKey no R2.'));
    return;
  }
  next();
});

photoSchema.pre('save', function stripEmptyDriveField(next) {
  if (!this.driveFileId) this.set('driveFileId', undefined);
  next();
});

export const Photo: Model<IPhotoDocument> =
  mongoose.models.Photo ??
  mongoose.model<IPhotoDocument>('Photo', photoSchema);
