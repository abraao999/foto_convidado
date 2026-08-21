import { Types } from 'mongoose';
import { EventTable, type IEventTableDocument } from '../models/EventTable.js';
import { Guest } from '../models/Guest.js';
import { GiftItem } from '../models/GiftItem.js';
import { findOwnedGallery } from './gallery.service.js';
import {
  canAssignToTable,
  partySize,
  summarizeGuests,
  tableFill,
} from './planning.helpers.js';

export function serializeTable(
  table: IEventTableDocument,
  occupied: number
) {
  const fill = tableFill(table.seats, occupied);
  return {
    id: table._id.toString(),
    galleryId: table.galleryId.toString(),
    name: table.name,
    seats: table.seats,
    occupied,
    available: Math.max(0, table.seats - occupied),
    fill,
    notes: table.notes,
    sortOrder: table.sortOrder,
    createdAt: table.createdAt,
    updatedAt: table.updatedAt,
  };
}

async function ownedGallery(userId: string, galleryId: string) {
  const gallery = await findOwnedGallery(userId, galleryId);
  if (gallery.status === 'ARCHIVED') {
    throw new Error('Uma galeria arquivada não pode ser editada.');
  }
  return gallery;
}

async function occupancyMap(galleryId: Types.ObjectId) {
  const seated = await Guest.find({
    galleryId,
    tableId: { $exists: true, $ne: null },
    attendanceStatus: 'CONFIRMED',
  });
  const map = new Map<string, number>();
  for (const guest of seated) {
    if (!guest.tableId) continue;
    const key = guest.tableId.toString();
    map.set(key, (map.get(key) ?? 0) + partySize(guest));
  }
  return map;
}

export async function listTables(userId: string, galleryId: string) {
  const gallery = await findOwnedGallery(userId, galleryId);
  const [tables, guests, occupied] = await Promise.all([
    EventTable.find({ galleryId: gallery._id, userId: gallery.userId }).sort({
      sortOrder: 1,
      createdAt: 1,
    }),
    Guest.find({ galleryId: gallery._id, userId: gallery.userId }).select(
      '+inviteToken'
    ),
    occupancyMap(gallery._id),
  ]);
  const confirmed = guests.filter((guest) => guest.attendanceStatus === 'CONFIRMED');
  const unconfirmed = guests.filter(
    (guest) => guest.attendanceStatus !== 'CONFIRMED'
  );
  return {
    tables: tables.map((table) =>
      serializeTable(table, occupied.get(table._id.toString()) ?? 0)
    ),
    guests: confirmed.map((guest) => ({
      id: guest._id.toString(),
      fullName: guest.fullName,
      confirmedCompanionCount: guest.confirmedCompanionCount,
      partySize: partySize(guest),
      tableId: guest.tableId?.toString(),
      attendanceStatus: guest.attendanceStatus,
    })),
    unconfirmed: unconfirmed.map((guest) => ({
      id: guest._id.toString(),
      fullName: guest.fullName,
      attendanceStatus: guest.attendanceStatus,
      inviteStatus: guest.inviteStatus,
    })),
  };
}

export async function generateTables(
  userId: string,
  galleryId: string,
  input: { count: number; seatsPerTable: number }
) {
  const gallery = await ownedGallery(userId, galleryId);
  const count = Math.max(1, Math.min(80, Math.floor(input.count)));
  const seats = Math.max(1, Math.min(40, Math.floor(input.seatsPerTable)));
  const existing = await EventTable.find({
    galleryId: gallery._id,
    userId: gallery.userId,
  }).sort({ sortOrder: 1, createdAt: 1 });

  if (existing.length < count) {
    const docs = [];
    for (let index = existing.length; index < count; index += 1) {
      docs.push({
        galleryId: gallery._id,
        userId: gallery.userId,
        name: `Mesa ${index + 1}`,
        seats,
        sortOrder: index,
      });
    }
    await EventTable.insertMany(docs);
  } else if (existing.length > count) {
    const extra = existing.slice(count);
    for (const table of extra) {
      const seated = await Guest.exists({ tableId: table._id });
      if (seated) {
        throw new Error(
          'Não é possível reduzir mesas enquanto houver convidados sentados nas últimas mesas.'
        );
      }
    }
    await EventTable.deleteMany({
      _id: { $in: extra.map((table) => table._id) },
    });
  }

  return listTables(userId, galleryId);
}

export async function createTable(
  userId: string,
  galleryId: string,
  input: { name?: string; seats: number; notes?: string }
) {
  const gallery = await ownedGallery(userId, galleryId);
  const count = await EventTable.countDocuments({
    galleryId: gallery._id,
    userId: gallery.userId,
  });
  const table = await EventTable.create({
    galleryId: gallery._id,
    userId: gallery.userId,
    name: input.name?.trim() || `Mesa ${count + 1}`,
    seats: Math.max(1, Math.min(40, Math.floor(input.seats))),
    notes: input.notes?.trim() || undefined,
    sortOrder: count,
  });
  return serializeTable(table, 0);
}

export async function updateTable(
  userId: string,
  galleryId: string,
  tableId: string,
  input: { name?: string; seats?: number; notes?: string }
) {
  const gallery = await ownedGallery(userId, galleryId);
  const table = await EventTable.findOne({
    _id: tableId,
    galleryId: gallery._id,
    userId: gallery.userId,
  });
  if (!table) throw new Error('Mesa não encontrada.');
  if (input.name?.trim()) table.name = input.name.trim();
  if (typeof input.seats === 'number') {
    const seats = Math.max(1, Math.min(40, Math.floor(input.seats)));
    const occupied = (await occupancyMap(gallery._id)).get(table.id) ?? 0;
    if (seats < occupied) {
      throw new Error(
        'A capacidade não pode ser menor do que os lugares já ocupados.'
      );
    }
    table.seats = seats;
  }
  if (input.notes !== undefined) table.notes = input.notes.trim() || undefined;
  await table.save();
  const occupied = (await occupancyMap(gallery._id)).get(table.id) ?? 0;
  return serializeTable(table, occupied);
}

export async function deleteTable(
  userId: string,
  galleryId: string,
  tableId: string
) {
  const gallery = await ownedGallery(userId, galleryId);
  const seated = await Guest.exists({ tableId });
  if (seated) {
    throw new Error('Remova os convidados da mesa antes de excluí-la.');
  }
  const deleted = await EventTable.findOneAndDelete({
    _id: tableId,
    galleryId: gallery._id,
    userId: gallery.userId,
  });
  if (!deleted) throw new Error('Mesa não encontrada.');
  return { message: 'Mesa excluída.' };
}

export async function assignGuestToTable(
  userId: string,
  galleryId: string,
  tableId: string | null,
  guestId: string
) {
  const gallery = await ownedGallery(userId, galleryId);
  const guest = await Guest.findOne({
    _id: guestId,
    galleryId: gallery._id,
    userId: gallery.userId,
  });
  if (!guest) throw new Error('Convidado não encontrado.');

  if (!tableId) {
    guest.tableId = undefined;
    await guest.save();
    return listTables(userId, galleryId);
  }

  const table = await EventTable.findOne({
    _id: tableId,
    galleryId: gallery._id,
    userId: gallery.userId,
  });
  if (!table) throw new Error('Mesa não encontrada.');

  const occupiedMap = await occupancyMap(gallery._id);
  const currentTableId = guest.tableId?.toString();
  const occupied =
    (occupiedMap.get(table.id) ?? 0) -
    (currentTableId === table.id ? partySize(guest) : 0);
  const check = canAssignToTable(table.seats, occupied, partySize(guest));
  if (!check.ok) throw new Error(check.reason);

  guest.tableId = table._id;
  await guest.save();

  const recount = await occupancyMap(gallery._id);
  if ((recount.get(table.id) ?? 0) > table.seats) {
    guest.tableId = currentTableId
      ? new Types.ObjectId(currentTableId)
      : undefined;
    await guest.save();
    throw new Error('Esta mesa está cheia.');
  }
  return listTables(userId, galleryId);
}

export async function getPlanningSummary(userId: string, galleryId: string) {
  const gallery = await findOwnedGallery(userId, galleryId);
  const [guests, tables, gifts, occupied] = await Promise.all([
    Guest.find({ galleryId: gallery._id, userId: gallery.userId }),
    EventTable.find({ galleryId: gallery._id, userId: gallery.userId }),
    GiftItem.find({ galleryId: gallery._id, userId: gallery.userId }),
    occupancyMap(gallery._id),
  ]);
  const guestStats = summarizeGuests(guests);
  const seats = tables.reduce((total, table) => total + table.seats, 0);
  const occupiedSeats = [...occupied.values()].reduce(
    (total, value) => total + value,
    0
  );
  const purchased = gifts.filter((gift) => gift.status === 'PURCHASED').length;
  const available = gifts.filter((gift) => gift.status === 'AVAILABLE').length;
  return {
    event: {
      id: gallery._id.toString(),
      title: gallery.title,
      eventDate: gallery.eventDate,
      location: gallery.location,
      slug: gallery.slug,
    },
    guests: guestStats,
    tables: {
      count: tables.length,
      seats,
      occupied: occupiedSeats,
      available: Math.max(0, seats - occupiedSeats),
    },
    gifts: {
      total: gifts.length,
      purchased,
      available,
      reserved: gifts.filter((gift) => gift.status === 'RESERVED').length,
    },
  };
}
