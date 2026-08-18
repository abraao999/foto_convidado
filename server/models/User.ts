import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type UserRole = 'USER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'BLOCKED';

export interface IUser {
  name: string;
  lastName?: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  avatarDriveFileId?: string;
  eventName?: string;
  eventDescription?: string;
  eventDate?: Date;
  location?: string;
  publicSlug?: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDocument extends IUser, Document {}

const userSchema = new Schema<IUserDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    lastName: { type: String, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 30 },
    avatarUrl: { type: String, trim: true, maxlength: 2048 },
    avatarDriveFileId: { type: String, trim: true },
    eventName: { type: String, trim: true, maxlength: 160 },
    eventDescription: { type: String, trim: true, maxlength: 1000 },
    eventDate: { type: Date },
    location: { type: String, trim: true, maxlength: 240 },
    publicSlug: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 100,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['USER', 'ADMIN'], default: 'USER' },
    status: { type: String, enum: ['ACTIVE', 'BLOCKED'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

userSchema.index({ status: 1 });
userSchema.index({ publicSlug: 1 }, { unique: true, sparse: true });

export const User: Model<IUserDocument> =
  mongoose.models.User ?? mongoose.model<IUserDocument>('User', userSchema);
