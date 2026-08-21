export interface AccessOffer {
  priceCents: number;
  durationDays: number;
  maxGalleries: number;
  maxStorageBytes: number;
}

export interface SubscriptionInfo {
  id: string;
  userId: string;
  status: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'CANCELED';
  accessDaysGranted: number;
  startsAt?: string;
  expiresAt?: string;
  daysRemaining?: number;
}

export interface SubscriptionAlert {
  level: 'info' | 'warning' | 'critical' | 'expired';
  message: string;
}

export interface SubscriptionSummary {
  hasAccess: boolean;
  isAdmin: boolean;
  subscription: SubscriptionInfo | null;
  offer: AccessOffer;
  alert: SubscriptionAlert | null;
}

export function formatStorage(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${Math.round(gb)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

export function formatStorageDetail(bytes: number): string {
  const abs = Math.max(0, bytes);
  const gb = abs / 1024 ** 3;
  if (gb >= 1) {
    return `${gb.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} GB`;
  }
  const mb = abs / 1024 ** 2;
  if (mb >= 1) {
    return `${mb.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
  }
  const kb = abs / 1024;
  if (kb >= 1) {
    return `${kb.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} KB`;
  }
  return `${Math.round(abs)} B`;
}

export function formatPrice(priceCents: number): string {
  return (priceCents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function formatDate(date?: string): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('pt-BR');
}
