import mongoose, {
  Schema,
  type Document,
  type Model,
  Types,
} from 'mongoose';

export type PaymentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELED'
  | 'REFUNDED';

export interface IPayment {
  userId: Types.ObjectId;
  subscriptionId?: Types.ObjectId;
  externalPaymentId?: string;
  checkoutPreferenceId?: string;
  amountCents: number;
  status: PaymentStatus;
  paymentMethod?: string;
  statusDetail?: string;
  paidAt?: Date;
  accessGrantedAt?: Date;
  accessRevokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPaymentDocument extends IPayment, Document {}

const paymentSchema = new Schema<IPaymentDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: 'Subscription',
      index: true,
    },
    externalPaymentId: { type: String, trim: true },
    checkoutPreferenceId: { type: String, trim: true },
    amountCents: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELED', 'REFUNDED'],
      default: 'PENDING',
      index: true,
    },
    paymentMethod: { type: String, trim: true },
    statusDetail: { type: String, trim: true },
    paidAt: { type: Date },
    accessGrantedAt: { type: Date },
    accessRevokedAt: { type: Date },
  },
  { timestamps: true }
);

paymentSchema.index(
  { externalPaymentId: 1 },
  { unique: true, sparse: true }
);
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ status: 1, updatedAt: -1 });

export const PaymentModel: Model<IPaymentDocument> =
  mongoose.models.Payment ??
  mongoose.model<IPaymentDocument>('Payment', paymentSchema);
