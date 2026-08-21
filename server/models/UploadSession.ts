import mongoose, {
  Schema,
  Types,
  type Document,
  type Model,
} from 'mongoose';

export interface IUploadSession {
  token: string;
  userId: Types.ObjectId;
  galleryId: Types.ObjectId;
  storageKey: string;
  /** Quantidade de partes temporárias já enviadas ao R2. */
  partCount: number;
  fileName: string;
  mimeType: string;
  totalSize: number;
  uploadedBytes: number;
  /** Galeria pública exige status PUBLISHED no complete. */
  requirePublished?: boolean;
  lockedAt?: Date;
  completingAt?: Date;
  completedStorageKey?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUploadSessionDocument extends IUploadSession, Document {}

const uploadSessionSchema = new Schema<IUploadSessionDocument>(
  {
    token: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    galleryId: {
      type: Schema.Types.ObjectId,
      ref: 'Gallery',
      required: true,
    },
    storageKey: { type: String, required: true, maxlength: 512 },
    partCount: { type: Number, default: 0, min: 0 },
    fileName: { type: String, required: true, maxlength: 255 },
    mimeType: { type: String, required: true, maxlength: 100 },
    totalSize: { type: Number, required: true, min: 1 },
    uploadedBytes: { type: Number, default: 0, min: 0 },
    requirePublished: { type: Boolean, default: false },
    lockedAt: { type: Date },
    completingAt: { type: Date },
    completedStorageKey: { type: String },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

uploadSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UploadSession: Model<IUploadSessionDocument> =
  mongoose.models.UploadSession ??
  mongoose.model<IUploadSessionDocument>('UploadSession', uploadSessionSchema);
