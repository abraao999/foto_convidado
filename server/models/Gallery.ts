import mongoose, {
  Schema,
  Types,
  type Document,
  type Model,
} from 'mongoose';

export type GalleryStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface IGallery {
  userId: Types.ObjectId;
  title: string;
  description?: string;
  slug: string;
  coverPhoto?: string;
  eventDate?: Date;
  location?: string;
  status: GalleryStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGalleryDocument extends IGallery, Document {}

const gallerySchema = new Schema<IGalleryDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 1000 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 100,
    },
    coverPhoto: { type: String, trim: true, maxlength: 2048 },
    eventDate: { type: Date },
    location: { type: String, trim: true, maxlength: 240 },
    status: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
      default: 'DRAFT',
    },
  },
  { timestamps: true }
);

gallerySchema.index({ userId: 1, createdAt: -1 });
gallerySchema.index({ userId: 1, status: 1 });

export const Gallery: Model<IGalleryDocument> =
  mongoose.models.Gallery ??
  mongoose.model<IGalleryDocument>('Gallery', gallerySchema);
