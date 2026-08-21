import mongoose, {
  Schema,
  Types,
  type Document,
  type Model,
} from 'mongoose';
import type {
  AttendanceStatus,
  InviteStatus,
} from '../services/planning.helpers.js';

export interface ICompanion {
  name?: string;
}

export interface IGuest {
  galleryId: Types.ObjectId;
  userId: Types.ObjectId;
  fullName: string;
  phone: string;
  email?: string;
  maxCompanions: number;
  companions: ICompanion[];
  notes?: string;
  inviteMessage?: string;
  inviteStatus: InviteStatus;
  attendanceStatus: AttendanceStatus;
  confirmedCompanionCount: number;
  bringingChildren: boolean;
  childCount: number;
  childAges: number[];
  tableId?: Types.ObjectId;
  inviteToken: string;
  inviteViewedAt?: Date;
  rsvpAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGuestDocument extends IGuest, Document {}

const guestSchema = new Schema<IGuestDocument>(
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
    fullName: { type: String, required: true, trim: true, maxlength: 160 },
    phone: { type: String, required: true, trim: true, maxlength: 40 },
    email: { type: String, trim: true, lowercase: true, maxlength: 160 },
    maxCompanions: { type: Number, default: 0, min: 0, max: 20 },
    companions: {
      type: [{ name: { type: String, trim: true, maxlength: 160 } }],
      default: [],
    },
    notes: { type: String, trim: true, maxlength: 1000 },
    inviteMessage: { type: String, trim: true, maxlength: 1000 },
    inviteStatus: {
      type: String,
      enum: ['PENDING', 'SENT', 'VIEWED', 'CONFIRMED', 'DECLINED'],
      default: 'PENDING',
      index: true,
    },
    attendanceStatus: {
      type: String,
      enum: ['UNANSWERED', 'CONFIRMED', 'DECLINED'],
      default: 'UNANSWERED',
      index: true,
    },
    confirmedCompanionCount: { type: Number, default: 0, min: 0, max: 20 },
    bringingChildren: { type: Boolean, default: false },
    childCount: { type: Number, default: 0, min: 0, max: 10 },
    childAges: { type: [Number], default: [] },
    tableId: { type: Schema.Types.ObjectId, ref: 'EventTable', index: true },
    inviteToken: { type: String, required: true, unique: true, select: false },
    inviteViewedAt: { type: Date },
    rsvpAt: { type: Date },
  },
  { timestamps: true }
);

guestSchema.index({ galleryId: 1, createdAt: -1 });
guestSchema.index({ galleryId: 1, attendanceStatus: 1 });
guestSchema.index({ galleryId: 1, inviteStatus: 1 });
guestSchema.index({ galleryId: 1, fullName: 1 });

export const Guest: Model<IGuestDocument> =
  mongoose.models.Guest ?? mongoose.model<IGuestDocument>('Guest', guestSchema);
