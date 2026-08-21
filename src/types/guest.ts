export type InviteStatus =
  | 'PENDING'
  | 'SENT'
  | 'VIEWED'
  | 'CONFIRMED'
  | 'DECLINED';

export type AttendanceStatus = 'UNANSWERED' | 'CONFIRMED' | 'DECLINED';

export type GuestListFilter =
  | 'all'
  | 'pending'
  | 'confirmed'
  | 'declined'
  | 'no_response';

export interface GuestInfo {
  id: string;
  galleryId: string;
  fullName: string;
  phone: string;
  email?: string;
  maxCompanions: number;
  confirmedCompanionCount: number;
  bringingChildren?: boolean;
  childCount?: number;
  childAges?: number[];
  notes?: string;
  inviteMessage?: string;
  inviteStatus: InviteStatus;
  attendanceStatus: AttendanceStatus;
  tableId?: string;
  inviteUrl?: string;
  inviteViewedAt?: string;
  rsvpAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GuestStats {
  total: number;
  confirmed: number;
  declined: number;
  pending: number;
  noResponse: number;
  confirmedPeople: number;
  confirmedCompanions: number;
  confirmedAdults: number;
  childrenUpTo3: number;
  childrenUpTo10: number;
  expectedPeople: number;
}

export const inviteStatusLabel: Record<InviteStatus, string> = {
  PENDING: 'Pendente',
  SENT: 'Convite enviado',
  VIEWED: 'Visualizado',
  CONFIRMED: 'Confirmado',
  DECLINED: 'Recusado',
};

export const attendanceStatusLabel: Record<AttendanceStatus, string> = {
  UNANSWERED: 'Sem resposta',
  CONFIRMED: 'Confirmado',
  DECLINED: 'Recusado',
};

export function digitsOnlyPhone(value: string) {
  return value.replace(/\D/g, '').slice(0, 11);
}

export function maskPhone(value: string) {
  const digits = digitsOnlyPhone(value);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function whatsAppPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits.slice(0, 13);
  }
  return `55${digits.slice(0, 11)}`;
}

export function absoluteInviteUrl(inviteUrl?: string) {
  if (!inviteUrl) return '';
  return inviteUrl.startsWith('http')
    ? inviteUrl
    : `${window.location.origin}${inviteUrl}`;
}

export function whatsAppInviteHref(input: {
  phone: string;
  fullName: string;
  eventTitle: string;
  inviteUrl?: string;
  inviteMessage?: string;
}) {
  const phone = whatsAppPhone(input.phone);
  const link = absoluteInviteUrl(input.inviteUrl);
  if (!phone || !link) return '';
  const firstName = input.fullName.trim().split(/\s+/)[0] || 'convidado';
  const custom = input.inviteMessage?.trim();
  const text = [
    `Olá, ${firstName}! Você está convidado(a) para ${input.eventTitle}.`,
    custom || '',
    'Confirme sua presença pelo link:',
    link,
  ]
    .filter(Boolean)
    .join('\n\n');
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
