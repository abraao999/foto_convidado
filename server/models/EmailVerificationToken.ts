import mongoose, { Schema, type Document, type Model, Types } from 'mongoose';

export interface IEmailVerificationToken {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
}

export interface IEmailVerificationTokenDocument
  extends IEmailVerificationToken,
    Document {}

const emailVerificationTokenSchema = new Schema<IEmailVerificationTokenDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

emailVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailVerificationToken: Model<IEmailVerificationTokenDocument> =
  mongoose.models.EmailVerificationToken ??
  mongoose.model<IEmailVerificationTokenDocument>(
    'EmailVerificationToken',
    emailVerificationTokenSchema
  );
