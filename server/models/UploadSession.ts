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
  uploadUrl: string;
  fileName: string;
  mimeType: string;
  totalSize: number;
  uploadedBytes: number;
  driveFileId?: string;
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
    uploadUrl: { type: String, required: true },
    fileName: { type: String, required: true, maxlength: 255 },
    mimeType: { type: String, required: true, maxlength: 100 },
    totalSize: { type: Number, required: true, min: 1 },
    uploadedBytes: { type: Number, default: 0, min: 0 },
    driveFileId: { type: String },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

uploadSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UploadSession: Model<IUploadSessionDocument> =
  mongoose.models.UploadSession ??
  mongoose.model<IUploadSessionDocument>('UploadSession', uploadSessionSchema);
