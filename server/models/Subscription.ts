import mongoose, { Schema, type Document, type Model, Types } from 'mongoose';

export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'CANCELED';

export interface ISubscription {
  userId: Types.ObjectId;
  status: SubscriptionStatus;
  accessDaysGranted: number;
  startsAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISubscriptionDocument extends ISubscription, Document {}

const subscriptionSchema = new Schema<ISubscriptionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'EXPIRED', 'CANCELED'],
      default: 'PENDING',
      index: true,
    },
    accessDaysGranted: { type: Number, required: true, min: 1, default: 90 },
    startsAt: { type: Date },
    expiresAt: { type: Date, index: true },
  },
  { timestamps: true }
);

subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ userId: 1, expiresAt: -1 });
/** No máximo uma assinatura ACTIVE por usuário — grants concorrentes estendem este documento. */
subscriptionSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'ACTIVE' },
    name: 'userId_active_unique',
  }
);

export const Subscription: Model<ISubscriptionDocument> =
  mongoose.models.Subscription ??
  mongoose.model<ISubscriptionDocument>('Subscription', subscriptionSchema);
