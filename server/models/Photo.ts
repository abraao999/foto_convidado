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
  driveFileId: string;
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
    driveFileId: { type: String, required: true, unique: true },
    thumbnailUrl: { type: String, required: true, maxlength: 2048 },
    mimeType: { type: String, required: true, maxlength: 100 },
    size: { type: Number, required: true, min: 1 },
  },
  { timestamps: true }
);

photoSchema.index({ galleryId: 1, createdAt: -1 });
photoSchema.index({ userId: 1, createdAt: -1 });

export const Photo: Model<IPhotoDocument> =
  mongoose.models.Photo ??
  mongoose.model<IPhotoDocument>('Photo', photoSchema);
