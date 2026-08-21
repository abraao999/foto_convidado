import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { Guest, type IGuestDocument } from '../models/Guest.js';
import { Gallery } from '../models/Gallery.js';
import { findOwnedGallery } from './gallery.service.js';
import {
  allocateRsvpParty,
  clampCompanions,
  guestMongoFilter,
  invitePublicUrl,
  summarizeGuests,
  type AttendanceStatus,
  type GuestListFilter,
  type InviteStatus,
} from './planning.helpers.js';

export interface GuestInput {
  fullName: string;
  phone: string;
  email?: string;
  maxCompanions?: number;
  notes?: string;
  inviteMessage?: string;
}

function newInviteToken() {
  return randomBytes(32).toString('hex');
}

export function serializeGuest(
  guest: IGuestDocument,
  extras?: { slug?: string; includeInviteUrl?: boolean }
) {
  return {
    id: guest._id.toString(),
    galleryId: guest.galleryId.toString(),
    fullName: guest.fullName,
    phone: guest.phone,
    email: guest.email,
    maxCompanions: guest.maxCompanions,
    confirmedCompanionCount: guest.confirmedCompanionCount,
    bringingChildren: guest.bringingChildren,
    childCount: guest.childCount,
    childAges: guest.childAges,
    notes: guest.notes,
    inviteMessage: guest.inviteMessage,
    inviteStatus: guest.inviteStatus,
    attendanceStatus: guest.attendanceStatus,
    tableId: guest.tableId?.toString(),
    inviteViewedAt: guest.inviteViewedAt,
    rsvpAt: guest.rsvpAt,
    createdAt: guest.createdAt,
    updatedAt: guest.updatedAt,
    inviteUrl:
      extras?.includeInviteUrl && extras.slug && guest.inviteToken
        ? invitePublicUrl(extras.slug, guest.inviteToken)
        : undefined,
  };
}

async function ownedGallery(userId: string, galleryId: string) {
  const gallery = await findOwnedGallery(userId, galleryId);
  if (gallery.status === 'ARCHIVED') {
    throw new Error('Uma galeria arquivada não pode ser editada.');
  }
  return gallery;
}

export async function listGuests(
  userId: string,
  galleryId: string,
  input: { q?: string; filter?: GuestListFilter } = {}
) {
  const gallery = await findOwnedGallery(userId, galleryId);
  const filter = input.filter ?? 'all';
  const query: Record<string, unknown> = {
    galleryId: gallery._id,
    userId: gallery.userId,
    ...guestMongoFilter(filter),
  };
  const q = input.q?.trim();
  if (q) {
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ fullName: regex }, { phone: regex }, { email: regex }];
  }
  const guests = await Guest.find(query)
    .select('+inviteToken')
    .sort({ createdAt: -1 });
  const all = await Guest.find({
    galleryId: gallery._id,
    userId: gallery.userId,
  }).select(
    'maxCompanions confirmedCompanionCount childCount childAges attendanceStatus inviteStatus'
  );
  return {
    guests: guests.map((guest) =>
      serializeGuest(guest, { slug: gallery.slug, includeInviteUrl: true })
    ),
    stats: summarizeGuests(all),
  };
}

export async function createGuest(
  userId: string,
  galleryId: string,
  input: GuestInput
) {
  const gallery = await ownedGallery(userId, galleryId);
  const guest = await Guest.create({
    galleryId: gallery._id,
    userId: gallery.userId,
    fullName: input.fullName.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() || undefined,
    maxCompanions: clampCompanions(input.maxCompanions ?? 0, 20),
    notes: input.notes?.trim() || undefined,
    inviteMessage: input.inviteMessage?.trim() || undefined,
    inviteToken: newInviteToken(),
  });
  const created = await Guest.findById(guest._id).select('+inviteToken');
  return serializeGuest(created!, {
    slug: gallery.slug,
    includeInviteUrl: true,
  });
}

export async function updateGuest(
  userId: string,
  galleryId: string,
  guestId: string,
  input: GuestInput & {
    inviteStatus?: InviteStatus;
    attendanceStatus?: AttendanceStatus;
    confirmedCompanionCount?: number;
  }
) {
  const gallery = await ownedGallery(userId, galleryId);
  if (!Types.ObjectId.isValid(guestId)) {
    throw new Error('Convidado não encontrado.');
  }
  const guest = await Guest.findOne({
    _id: guestId,
    galleryId: gallery._id,
    userId: gallery.userId,
  }).select('+inviteToken');
  if (!guest) throw new Error('Convidado não encontrado.');

  guest.fullName = input.fullName.trim();
  guest.phone = input.phone.trim();
  guest.email = input.email?.trim() || undefined;
  guest.maxCompanions = clampCompanions(input.maxCompanions ?? 0, 20);
  guest.notes = input.notes?.trim() || undefined;
  guest.inviteMessage = input.inviteMessage?.trim() || undefined;
  if (input.inviteStatus) guest.inviteStatus = input.inviteStatus;
  if (input.attendanceStatus) {
    guest.attendanceStatus = input.attendanceStatus;
    if (input.attendanceStatus === 'CONFIRMED') {
      guest.inviteStatus = 'CONFIRMED';
    }
    if (input.attendanceStatus === 'DECLINED') {
      guest.inviteStatus = 'DECLINED';
      guest.tableId = undefined;
      guest.confirmedCompanionCount = 0;
      guest.bringingChildren = false;
      guest.childCount = 0;
      guest.childAges = [];
    }
  }
  if (typeof input.confirmedCompanionCount === 'number') {
    guest.confirmedCompanionCount = clampCompanions(
      input.confirmedCompanionCount,
      guest.maxCompanions
    );
  } else if (guest.confirmedCompanionCount > guest.maxCompanions) {
    guest.confirmedCompanionCount = guest.maxCompanions;
  }
  const remainingForChildren =
    guest.maxCompanions - guest.confirmedCompanionCount;
  if (guest.childCount > remainingForChildren) {
    guest.childCount = remainingForChildren;
    guest.childAges = (guest.childAges ?? []).slice(0, remainingForChildren);
  }
  if (guest.childCount === 0) {
    guest.bringingChildren = false;
    guest.childAges = [];
  }
  await guest.save();
  return serializeGuest(guest, { slug: gallery.slug, includeInviteUrl: true });
}

export async function deleteGuest(
  userId: string,
  galleryId: string,
  guestId: string
) {
  const gallery = await ownedGallery(userId, galleryId);
  if (!Types.ObjectId.isValid(guestId)) {
    throw new Error('Convidado não encontrado.');
  }
  const deleted = await Guest.findOneAndDelete({
    _id: guestId,
    galleryId: gallery._id,
    userId: gallery.userId,
  });
  if (!deleted) throw new Error('Convidado não encontrado.');
  return { message: 'Convidado excluído.' };
}

export async function markInviteSent(
  userId: string,
  galleryId: string,
  guestId: string
) {
  const gallery = await ownedGallery(userId, galleryId);
  const guest = await Guest.findOne({
    _id: guestId,
    galleryId: gallery._id,
    userId: gallery.userId,
  }).select('+inviteToken');
  if (!guest) throw new Error('Convidado não encontrado.');
  if (guest.attendanceStatus === 'UNANSWERED' && guest.inviteStatus === 'PENDING') {
    guest.inviteStatus = 'SENT';
    await guest.save();
  }
  return serializeGuest(guest, { slug: gallery.slug, includeInviteUrl: true });
}

export async function getPublicInvitation(token: string, slug?: string) {
  if (!token || token.length < 32) {
    throw new Error('Convite não encontrado.');
  }
  const guest = await Guest.findOne({ inviteToken: token }).select(
    '+inviteToken'
  );
  if (!guest) throw new Error('Convite não encontrado.');

  const gallery = await Gallery.findById(guest.galleryId);
  if (!gallery || gallery.status === 'ARCHIVED') {
    throw new Error('Convite não encontrado.');
  }
  if (slug && gallery.slug !== slug) {
    throw new Error('Convite não encontrado.');
  }

  if (
    guest.attendanceStatus === 'UNANSWERED' &&
    (guest.inviteStatus === 'PENDING' || guest.inviteStatus === 'SENT')
  ) {
    guest.inviteStatus = 'VIEWED';
    guest.inviteViewedAt = new Date();
    await guest.save();
  }

  return {
    guest: {
      fullName: guest.fullName,
      maxCompanions: guest.maxCompanions,
      attendanceStatus: guest.attendanceStatus,
      confirmedCompanionCount: guest.confirmedCompanionCount,
      bringingChildren: guest.bringingChildren,
      childCount: guest.childCount,
      childAges: guest.childAges,
      inviteMessage: guest.inviteMessage,
    },
    event: {
      title: gallery.title,
      description: gallery.description,
      eventDate: gallery.eventDate,
      location: gallery.location,
      slug: gallery.slug,
      coverUrl: gallery.coverPhoto
        ? `/api/public/invitations/${token}/cover?v=${gallery.updatedAt.getTime()}`
        : undefined,
    },
  };
}

export async function getInvitationCoverKey(token: string) {
  if (!token || token.length < 32) {
    throw new Error('Convite não encontrado.');
  }
  const guest = await Guest.findOne({ inviteToken: token }).select('galleryId');
  if (!guest) throw new Error('Convite não encontrado.');
  const gallery = await Gallery.findById(guest.galleryId);
  if (!gallery || gallery.status === 'ARCHIVED' || !gallery.coverPhoto) {
    throw new Error('Esta galeria ainda não tem foto de capa.');
  }
  return gallery.coverPhoto;
}

export async function submitPublicRsvp(
  token: string,
  input: {
    attending: boolean;
    companionCount?: number;
    bringingChildren?: boolean;
    childCount?: number;
    childAges?: number[];
  }
) {
  const guest = await Guest.findOne({ inviteToken: token }).select(
    '+inviteToken'
  );
  if (!guest) throw new Error('Convite não encontrado.');

  const next = allocateRsvpParty({
    attending: input.attending,
    companionCount: input.companionCount,
    bringingChildren: input.bringingChildren,
    childCount: input.childCount,
    childAges: input.childAges,
    maxCompanions: guest.maxCompanions,
  });
  guest.inviteStatus = next.inviteStatus;
  guest.attendanceStatus = next.attendanceStatus;
  guest.confirmedCompanionCount = next.confirmedCompanionCount;
  guest.bringingChildren = next.bringingChildren;
  guest.childCount = next.childCount;
  guest.childAges = next.childAges;
  guest.rsvpAt = new Date();
  if (next.attendanceStatus !== 'CONFIRMED') {
    guest.tableId = undefined;
  }
  await guest.save();

  return {
    attendanceStatus: guest.attendanceStatus,
    confirmedCompanionCount: guest.confirmedCompanionCount,
    bringingChildren: guest.bringingChildren,
    childCount: guest.childCount,
    childAges: guest.childAges,
    message: input.attending
      ? 'Presença confirmada! Esperamos você.'
      : 'Sentiremos sua falta. Obrigado por nos avisar.',
  };
}

export async function guestForPublicToken(token: string) {
  const guest = await Guest.findOne({ inviteToken: token });
  if (!guest) throw new Error('Convite não encontrado.');
  return guest;
}
