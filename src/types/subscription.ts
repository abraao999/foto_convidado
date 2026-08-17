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
