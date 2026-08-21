import mongoose, {
  Schema,
  Types,
  type Document,
  type Model,
} from 'mongoose';

export interface IEventTable {
  galleryId: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  seats: number;
  notes?: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEventTableDocument extends IEventTable, Document {}

const eventTableSchema = new Schema<IEventTableDocument>(
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
    name: { type: String, required: true, trim: true, maxlength: 80 },
    seats: { type: Number, required: true, min: 1, max: 40 },
    notes: { type: String, trim: true, maxlength: 400 },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

eventTableSchema.index({ galleryId: 1, sortOrder: 1 });

export const EventTable: Model<IEventTableDocument> =
  mongoose.models.EventTable ??
  mongoose.model<IEventTableDocument>('EventTable', eventTableSchema);
