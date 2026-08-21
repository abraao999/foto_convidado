export type InviteStatus =
  | 'PENDING'
  | 'SENT'
  | 'VIEWED'
  | 'CONFIRMED'
  | 'DECLINED';

export type AttendanceStatus = 'UNANSWERED' | 'CONFIRMED' | 'DECLINED';

export type GiftStatus = 'AVAILABLE' | 'RESERVED' | 'PURCHASED';

export type TableFill = 'available' | 'partial' | 'full';

export type GuestListFilter =
  | 'all'
  | 'pending'
  | 'confirmed'
  | 'declined'
  | 'no_response';

const MAX_CHILDREN = 10;

export function extraGuests(input: {
  confirmedCompanionCount: number;
  childCount?: number;
  maxCompanions?: number;
}) {
  const extras =
    Math.max(0, input.confirmedCompanionCount) +
    Math.max(0, input.childCount ?? 0);
  if (input.maxCompanions == null) return extras;
  return Math.min(extras, Math.max(0, input.maxCompanions));
}

export function partySize(input: {
  attendanceStatus: AttendanceStatus;
  confirmedCompanionCount: number;
  childCount?: number;
  maxCompanions?: number;
}): number {
  if (input.attendanceStatus !== 'CONFIRMED') return 0;
  return 1 + extraGuests(input);
}

export function normalizeChildren(input: {
  attending: boolean;
  bringingChildren?: boolean;
  childCount?: number;
  childAges?: number[];
  maxChildren?: number;
}): { bringingChildren: boolean; childCount: number; childAges: number[] } {
  if (!input.attending || !input.bringingChildren) {
    return { bringingChildren: false, childCount: 0, childAges: [] };
  }
  const childCount = clampCompanions(
    input.childCount ?? 0,
    Math.min(MAX_CHILDREN, input.maxChildren ?? MAX_CHILDREN)
  );
  if (childCount === 0) {
    return { bringingChildren: false, childCount: 0, childAges: [] };
  }
  const childAges = Array.from({ length: childCount }, (_, index) => {
    const raw = Number(input.childAges?.[index]);
    if (!Number.isFinite(raw)) return 0;
    return Math.min(17, Math.max(0, Math.floor(raw)));
  });
  return { bringingChildren: true, childCount, childAges };
}

export function clampCompanions(requested: number, maxCompanions: number) {
  const max = Math.max(0, Math.floor(maxCompanions));
  if (!Number.isFinite(requested) || requested < 0) return 0;
  return Math.min(Math.floor(requested), max);
}

export function applyRsvp(input: {
  attending: boolean;
  companionCount?: number;
  maxCompanions: number;
}): {
  inviteStatus: InviteStatus;
  attendanceStatus: AttendanceStatus;
  confirmedCompanionCount: number;
} {
  if (!input.attending) {
    return {
      inviteStatus: 'DECLINED',
      attendanceStatus: 'DECLINED',
      confirmedCompanionCount: 0,
    };
  }
  return {
    inviteStatus: 'CONFIRMED',
    attendanceStatus: 'CONFIRMED',
    confirmedCompanionCount: clampCompanions(
      input.companionCount ?? 0,
      input.maxCompanions
    ),
  };
}

export function allocateRsvpParty(input: {
  attending: boolean;
  companionCount?: number;
  bringingChildren?: boolean;
  childCount?: number;
  childAges?: number[];
  maxCompanions: number;
}) {
  const rsvp = applyRsvp({
    attending: input.attending,
    companionCount: input.companionCount,
    maxCompanions: input.maxCompanions,
  });
  const remaining =
    rsvp.attendanceStatus === 'CONFIRMED'
      ? input.maxCompanions - rsvp.confirmedCompanionCount
      : 0;
  const children = normalizeChildren({
    attending: input.attending,
    bringingChildren: input.bringingChildren,
    childCount: input.childCount,
    childAges: input.childAges,
    maxChildren: remaining,
  });
  return { ...rsvp, ...children };
}

export function matchesGuestFilter(
  guest: {
    inviteStatus: InviteStatus;
    attendanceStatus: AttendanceStatus;
  },
  filter: GuestListFilter
) {
  switch (filter) {
    case 'all':
      return true;
    case 'confirmed':
      return guest.attendanceStatus === 'CONFIRMED';
    case 'declined':
      return guest.attendanceStatus === 'DECLINED';
    case 'pending':
      return (
        guest.attendanceStatus === 'UNANSWERED' &&
        guest.inviteStatus === 'PENDING'
      );
    case 'no_response':
      return (
        guest.attendanceStatus === 'UNANSWERED' &&
        guest.inviteStatus !== 'PENDING'
      );
    default:
      return true;
  }
}

export function guestMongoFilter(filter: GuestListFilter) {
  if (filter === 'confirmed') return { attendanceStatus: 'CONFIRMED' };
  if (filter === 'declined') return { attendanceStatus: 'DECLINED' };
  if (filter === 'pending') {
    return { attendanceStatus: 'UNANSWERED', inviteStatus: 'PENDING' };
  }
  if (filter === 'no_response') {
    return {
      attendanceStatus: 'UNANSWERED',
      inviteStatus: { $ne: 'PENDING' },
    };
  }
  return {};
}

export function classifyConfirmedPeople(guest: {
  attendanceStatus: AttendanceStatus;
  confirmedCompanionCount: number;
  childCount?: number;
  childAges?: number[];
  maxCompanions?: number;
}): { adults: number; childrenUpTo3: number; childrenUpTo10: number } {
  if (guest.attendanceStatus !== 'CONFIRMED') {
    return { adults: 0, childrenUpTo3: 0, childrenUpTo10: 0 };
  }
  const extras = extraGuests(guest);
  const childCount = Math.min(Math.max(0, guest.childCount ?? 0), extras);
  const companionAdults = extras - childCount;
  let childrenUpTo3 = 0;
  let childrenUpTo10 = 0;
  let olderChildren = 0;
  const ages = guest.childAges ?? [];
  for (let index = 0; index < childCount; index += 1) {
    const raw = Number(ages[index]);
    const age = Number.isFinite(raw) ? Math.floor(raw) : 0;
    if (age <= 3) childrenUpTo3 += 1;
    else if (age <= 10) childrenUpTo10 += 1;
    else olderChildren += 1;
  }
  return {
    adults: 1 + companionAdults + olderChildren,
    childrenUpTo3,
    childrenUpTo10,
  };
}

export function summarizeGuests(
  guests: Array<{
    maxCompanions: number;
    confirmedCompanionCount: number;
    childCount?: number;
    childAges?: number[];
    attendanceStatus: AttendanceStatus;
    inviteStatus: InviteStatus;
  }>
) {
  let confirmed = 0;
  let declined = 0;
  let pending = 0;
  let noResponse = 0;
  let confirmedPeople = 0;
  let confirmedCompanions = 0;
  let confirmedAdults = 0;
  let childrenUpTo3 = 0;
  let childrenUpTo10 = 0;

  for (const guest of guests) {
    if (guest.attendanceStatus === 'CONFIRMED') {
      confirmed += 1;
      confirmedCompanions += extraGuests(guest);
      confirmedPeople += partySize(guest);
      const ages = classifyConfirmedPeople(guest);
      confirmedAdults += ages.adults;
      childrenUpTo3 += ages.childrenUpTo3;
      childrenUpTo10 += ages.childrenUpTo10;
    } else if (guest.attendanceStatus === 'DECLINED') {
      declined += 1;
    } else if (guest.inviteStatus === 'PENDING') {
      pending += 1;
    } else {
      noResponse += 1;
    }
  }

  return {
    total: guests.length,
    confirmed,
    declined,
    pending,
    noResponse,
    confirmedPeople,
    confirmedCompanions,
    confirmedAdults,
    childrenUpTo3,
    childrenUpTo10,
    expectedPeople: confirmedPeople,
  };
}

export function remainingGiftUnits(
  desiredQuantity: number,
  purchasedQuantity: number,
  reservedQuantity = 0
) {
  return Math.max(
    0,
    desiredQuantity - purchasedQuantity - reservedQuantity
  );
}

export function giftStatusFromCounts(
  desiredQuantity: number,
  purchasedQuantity: number,
  reservedQuantity = 0
): GiftStatus {
  if (purchasedQuantity >= desiredQuantity) return 'PURCHASED';
  if (reservedQuantity > 0) return 'RESERVED';
  return 'AVAILABLE';
}

export function canPurchaseGift(
  desiredQuantity: number,
  purchasedQuantity: number
) {
  return purchasedQuantity < desiredQuantity;
}

export function tableFill(seats: number, occupied: number): TableFill {
  if (occupied <= 0) return 'available';
  if (occupied >= seats) return 'full';
  return 'partial';
}

export function canAssignToTable(
  seats: number,
  occupied: number,
  party: number
): { ok: true } | { ok: false; reason: string } {
  if (party <= 0) {
    return {
      ok: false,
      reason: 'Só convidados confirmados ocupam lugares na mesa.',
    };
  }
  if (occupied >= seats) {
    return { ok: false, reason: 'Esta mesa está cheia.' };
  }
  if (occupied + party > seats) {
    return {
      ok: false,
      reason:
        'Não há lugares suficientes para este convidado e seus acompanhantes.',
    };
  }
  return { ok: true };
}

export function invitePublicUrl(slug: string, token: string) {
  const origin = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '');
  const path = `/evento/${slug}/convite/${token}`;
  return origin ? `${origin}${path}` : path;
}
