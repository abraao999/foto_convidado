export type GiftStatus = 'AVAILABLE' | 'RESERVED' | 'PURCHASED';

export interface GiftOffer {
  provider: string;
  title: string;
  store: string;
  priceCents: number;
  previousPriceCents?: number;
  url: string;
  imageUrl?: string;
  queriedAt: string;
}

export interface GiftInfo {
  id: string;
  galleryId: string;
  name: string;
  description?: string;
  category?: string;
  desiredQuantity: number;
  purchasedQuantity: number;
  remainingQuantity: number;
  imageUrl?: string;
  productUrl?: string;
  priceCents?: number;
  previousPriceCents?: number;
  store?: string;
  priceUpdatedAt?: string;
  status: GiftStatus;
  notes?: string;
  offers: GiftOffer[];
}

export const giftStatusLabel: Record<GiftStatus, string> = {
  AVAILABLE: 'Disponível',
  RESERVED: 'Reservado',
  PURCHASED: 'Comprado',
};

export function formatPriceUpdatedAt(value?: string) {
  if (!value) return 'Preço ainda não consultado';
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return 'Preço ainda não consultado';
  const hours = Math.max(0, Math.round((Date.now() - then) / 3_600_000));
  if (hours < 1) return 'Atualizado há menos de 1 hora';
  if (hours === 1) return 'Atualizado há 1 hora';
  return `Atualizado há ${hours} horas`;
}

export function reaisInputFromCents(cents?: number) {
  if (cents == null || !Number.isFinite(cents)) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

export function parseReaisToCents(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  return Math.round(amount * 100);
}
