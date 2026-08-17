import mongoose, { Schema, type Document, type Model, Types } from 'mongoose';

export interface IPasswordResetToken {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
}

export interface IPasswordResetTokenDocument extends IPasswordResetToken, Document {}

const passwordResetTokenSchema = new Schema<IPasswordResetTokenDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordResetToken: Model<IPasswordResetTokenDocument> =
  mongoose.models.PasswordResetToken ??
  mongoose.model<IPasswordResetTokenDocument>('PasswordResetToken', passwordResetTokenSchema);
