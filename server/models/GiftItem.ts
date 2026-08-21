import mongoose, {
  Schema,
  Types,
  type Document,
  type Model,
} from 'mongoose';
import type { GiftStatus } from '../services/planning.helpers.js';

export interface IGiftOffer {
  provider: string;
  title: string;
  store: string;
  priceCents: number;
  previousPriceCents?: number;
  url: string;
  imageUrl?: string;
  queriedAt: Date;
}

export interface IGiftItem {
  galleryId: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  description?: string;
  category?: string;
  desiredQuantity: number;
  purchasedQuantity: number;
  reservedQuantity: number;
  imageUrl?: string;
  productUrl?: string;
  priceCents?: number;
  previousPriceCents?: number;
  store?: string;
  priceUpdatedAt?: Date;
  status: GiftStatus;
  notes?: string;
  offers: IGiftOffer[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IGiftItemDocument extends IGiftItem, Document {}

const offerSchema = new Schema<IGiftOffer>(
  {
    provider: { type: String, required: true, trim: true, maxlength: 40 },
    title: { type: String, required: true, trim: true, maxlength: 240 },
    store: { type: String, required: true, trim: true, maxlength: 80 },
    priceCents: { type: Number, required: true, min: 0 },
    previousPriceCents: { type: Number, min: 0 },
    url: { type: String, required: true, trim: true, maxlength: 2048 },
    imageUrl: { type: String, trim: true, maxlength: 2048 },
    queriedAt: { type: Date, required: true },
  },
  { _id: false }
);

const giftItemSchema = new Schema<IGiftItemDocument>(
  {
    galleryId: {
      type: Schema.Types.ObjectId,
      ref: 'Gallery',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 1000 },
    category: { type: String, trim: true, maxlength: 80 },
    desiredQuantity: { type: Number, default: 1, min: 1, max: 99 },
    purchasedQuantity: { type: Number, default: 0, min: 0, max: 99 },
    reservedQuantity: { type: Number, default: 0, min: 0, max: 99 },
    imageUrl: { type: String, trim: true, maxlength: 2048 },
    productUrl: { type: String, trim: true, maxlength: 2048 },
    priceCents: { type: Number, min: 0 },
    previousPriceCents: { type: Number, min: 0 },
    store: { type: String, trim: true, maxlength: 80 },
    priceUpdatedAt: { type: Date },
    status: {
      type: String,
      enum: ['AVAILABLE', 'RESERVED', 'PURCHASED'],
      default: 'AVAILABLE',
      index: true,
    },
    notes: { type: String, trim: true, maxlength: 1000 },
    offers: { type: [offerSchema], default: [] },
  },
  { timestamps: true }
);

giftItemSchema.index({ galleryId: 1, createdAt: -1 });
giftItemSchema.index({ galleryId: 1, status: 1 });
giftItemSchema.index({ galleryId: 1, category: 1 });

export const GiftItem: Model<IGiftItemDocument> =
  mongoose.models.GiftItem ??
  mongoose.model<IGiftItemDocument>('GiftItem', giftItemSchema);
