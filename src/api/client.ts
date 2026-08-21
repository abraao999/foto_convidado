import type { AccessOffer, SubscriptionInfo, SubscriptionSummary } from '../types/subscription';
import type { PaymentInfo } from '../types/payment';
import type { GalleryInfo } from '../types/gallery';
import type { PhotoInfo, PhotoStats } from '../types/photo';
import type { GuestInfo, GuestListFilter, GuestStats } from '../types/guest';
import type { GiftInfo, GiftOffer } from '../types/gift';
import type {
  PlanningSummary,
  SeatedGuest,
  TableInfo,
  UnconfirmedGuest,
} from '../types/planning';

export interface AuthUser {
  id: string;
  name: string;
  lastName?: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  eventName?: string;
  eventDescription?: string;
  eventDate?: string;
  location?: string;
  publicSlug?: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'BLOCKED';
  emailVerified?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ApiError {
  error?: string;
  message?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const data = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) {
    throw new Error(data.error ?? data.message ?? 'Erro inesperado.');
  }
  return data;
}

export const api = {
  register: (body: { name: string; email: string; password: string }) =>
    request<{
      user?: AuthUser;
      verificationRequired: boolean;
      email?: string;
      message: string;
    }>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),

  login: (body: { email: string; password: string }) =>
    request<{ user: AuthUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  me: () => request<{ user: AuthUser }>('/api/auth/me'),

  forgotPassword: (body: { email: string }) =>
    request<{ message: string }>('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify(body) }),

  resetPassword: (body: { token: string; password: string }) =>
    request<{ user: AuthUser; message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  verifyEmail: (body: { token: string }) =>
    request<{ user: AuthUser; message: string }>('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  resendVerification: (body: { email: string }) =>
    request<{ message: string }>('/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<{ user: AuthUser; message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateProfile: (body: {
    name: string;
    lastName?: string;
    phone?: string;
  }) =>
    request<{ user: AuthUser; message: string }>('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  uploadAvatar: (file: File) => {
    const body = new FormData();
    body.append('avatar', file);
    return request<{ user: AuthUser; message: string }>(
      '/api/profile/avatar',
      { method: 'POST', body }
    );
  },

  getGalleries: () =>
    request<{ galleries: GalleryInfo[] }>('/api/galleries'),

  createGallery: (body: {
    title: string;
    description?: string;
    slug?: string;
    eventDate?: string;
    location?: string;
  }) =>
    request<{ gallery: GalleryInfo; message: string }>('/api/galleries', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateGallery: (
    galleryId: string,
    body: {
      title: string;
      description?: string;
      slug?: string;
      eventDate?: string;
      location?: string;
    }
  ) =>
    request<{ gallery: GalleryInfo; message: string }>(
      `/api/galleries/${galleryId}`,
      { method: 'PATCH', body: JSON.stringify(body) }
    ),

  publishGallery: (galleryId: string) =>
    request<{ gallery: GalleryInfo; message: string }>(
      `/api/galleries/${galleryId}/publish`,
      { method: 'POST' }
    ),

  unpublishGallery: (galleryId: string) =>
    request<{ gallery: GalleryInfo; message: string }>(
      `/api/galleries/${galleryId}/unpublish`,
      { method: 'POST' }
    ),

  archiveGallery: (galleryId: string) =>
    request<{ gallery: GalleryInfo; message: string }>(
      `/api/galleries/${galleryId}`,
      { method: 'DELETE' }
    ),

  uploadGalleryCover: (galleryId: string, file: File) => {
    const body = new FormData();
    body.append('cover', file);
    return request<{ gallery: GalleryInfo; message: string }>(
      `/api/galleries/${galleryId}/cover`,
      { method: 'POST', body }
    );
  },

  getGalleryPhotos: (galleryId: string, page = 1, limit = 15) =>
    request<{
      photos: PhotoInfo[];
      total: number;
      page: number;
      limit: number;
    }>(
      `/api/photos/gallery/${galleryId}?page=${page}&limit=${limit}`
    ),

  getGalleryPhotoIds: (galleryId: string) =>
    request<{ ids: string[]; total: number }>(
      `/api/photos/gallery/${galleryId}/ids`
    ),

  deletePhoto: (photoId: string) =>
    request<{ ok: boolean; id: string; size: number; message: string }>(
      `/api/photos/${photoId}`,
      { method: 'DELETE' }
    ),

  downloadGalleryZip: async (
    galleryId: string,
    photoIds: string[],
    suggestedName = 'galeria-fotos.zip'
  ) => {
    const zip = await request<{
      downloadUrl: string;
      fileName: string;
      photoCount: number;
      expiresInSeconds: number;
    }>(`/api/photos/gallery/${encodeURIComponent(galleryId)}/zip`, {
      method: 'POST',
      body: JSON.stringify({ photoIds }),
    });

    const anchor = document.createElement('a');
    anchor.href = zip.downloadUrl;
    anchor.rel = 'noopener';
    anchor.download = zip.fileName || suggestedName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  },

  getPhotoStats: () => request<PhotoStats>('/api/photos/stats'),

  getSubscriptionSummary: () => request<SubscriptionSummary>('/api/subscriptions/me'),

  getSubscriptionHistory: () => request<{ subscriptions: SubscriptionInfo[] }>('/api/subscriptions/me/history'),

  premiumCheck: () => request<{ ok: boolean; message: string }>('/api/subscriptions/me/premium-check'),

  createCheckout: () =>
    request<{ payment: PaymentInfo; checkoutUrl: string }>(
      '/api/payments/checkout',
      { method: 'POST' }
    ),

  getPayments: () =>
    request<{ payments: PaymentInfo[] }>('/api/payments/me'),

  getGuests: (galleryId: string, filter: GuestListFilter = 'all', q = '') =>
    request<{ guests: GuestInfo[]; stats: GuestStats }>(
      `/api/galleries/${galleryId}/guests?filter=${filter}&q=${encodeURIComponent(q)}`
    ),

  createGuest: (
    galleryId: string,
    body: {
      fullName: string;
      phone: string;
      email?: string;
      maxCompanions?: number;
      notes?: string;
      inviteMessage?: string;
    }
  ) =>
    request<{ guest: GuestInfo; message: string }>(
      `/api/galleries/${galleryId}/guests`,
      { method: 'POST', body: JSON.stringify(body) }
    ),

  updateGuest: (
    galleryId: string,
    guestId: string,
    body: Record<string, unknown>
  ) =>
    request<{ guest: GuestInfo; message: string }>(
      `/api/galleries/${galleryId}/guests/${guestId}`,
      { method: 'PATCH', body: JSON.stringify(body) }
    ),

  markGuestInviteSent: (galleryId: string, guestId: string) =>
    request<{ guest: GuestInfo; message: string }>(
      `/api/galleries/${galleryId}/guests/${guestId}/mark-sent`,
      { method: 'POST' }
    ),

  deleteGuest: (galleryId: string, guestId: string) =>
    request<{ message: string }>(
      `/api/galleries/${galleryId}/guests/${guestId}`,
      { method: 'DELETE' }
    ),

  getGifts: (galleryId: string) =>
    request<{ gifts: GiftInfo[] }>(`/api/galleries/${galleryId}/gifts`),

  createGift: (galleryId: string, body: Record<string, unknown>) =>
    request<{ gift: GiftInfo; message: string }>(
      `/api/galleries/${galleryId}/gifts`,
      { method: 'POST', body: JSON.stringify(body) }
    ),

  updateGift: (galleryId: string, giftId: string, body: Record<string, unknown>) =>
    request<{ gift: GiftInfo; message: string }>(
      `/api/galleries/${galleryId}/gifts/${giftId}`,
      { method: 'PATCH', body: JSON.stringify(body) }
    ),

  deleteGift: (galleryId: string, giftId: string) =>
    request<{ message: string }>(
      `/api/galleries/${galleryId}/gifts/${giftId}`,
      { method: 'DELETE' }
    ),

  searchGiftOffers: (galleryId: string, query: string) =>
    request<{ offers: GiftOffer[]; providers: string[]; queriedAt: string }>(
      `/api/galleries/${galleryId}/gifts/search`,
      { method: 'POST', body: JSON.stringify({ query }) }
    ),

  refreshGiftPrice: (galleryId: string, giftId: string) =>
    request<{ gift: GiftInfo; message: string }>(
      `/api/galleries/${galleryId}/gifts/${giftId}/refresh-price`,
      { method: 'POST' }
    ),

  applyGiftOffer: (galleryId: string, giftId: string, offer: GiftOffer) =>
    request<{ gift: GiftInfo; message: string }>(
      `/api/galleries/${galleryId}/gifts/${giftId}/apply-offer`,
      { method: 'POST', body: JSON.stringify(offer) }
    ),

  getTables: (galleryId: string) =>
    request<{
      tables: TableInfo[];
      guests: SeatedGuest[];
      unconfirmed: UnconfirmedGuest[];
    }>(`/api/galleries/${galleryId}/tables`),

  generateTables: (galleryId: string, count: number, seatsPerTable: number) =>
    request<{
      tables: TableInfo[];
      guests: SeatedGuest[];
      unconfirmed: UnconfirmedGuest[];
      message: string;
    }>(`/api/galleries/${galleryId}/tables/generate`, {
      method: 'POST',
      body: JSON.stringify({ count, seatsPerTable }),
    }),

  createTable: (galleryId: string, body: { name?: string; seats: number; notes?: string }) =>
    request<{ table: TableInfo; message: string }>(
      `/api/galleries/${galleryId}/tables`,
      { method: 'POST', body: JSON.stringify(body) }
    ),

  updateTable: (
    galleryId: string,
    tableId: string,
    body: { name?: string; seats?: number; notes?: string }
  ) =>
    request<{ table: TableInfo; message: string }>(
      `/api/galleries/${galleryId}/tables/${tableId}`,
      { method: 'PATCH', body: JSON.stringify(body) }
    ),

  assignGuestToTable: (galleryId: string, tableId: string, guestId: string) =>
    request<{
      tables: TableInfo[];
      guests: SeatedGuest[];
      unconfirmed: UnconfirmedGuest[];
    }>(
      `/api/galleries/${galleryId}/tables/${tableId}/guests`,
      { method: 'POST', body: JSON.stringify({ guestId }) }
    ),

  unassignGuestFromTable: (galleryId: string, tableId: string, guestId: string) =>
    request<{
      tables: TableInfo[];
      guests: SeatedGuest[];
      unconfirmed: UnconfirmedGuest[];
    }>(
      `/api/galleries/${galleryId}/tables/${tableId}/guests/${guestId}`,
      { method: 'DELETE' }
    ),

  deleteTable: (galleryId: string, tableId: string) =>
    request<{ message: string }>(
      `/api/galleries/${galleryId}/tables/${tableId}`,
      { method: 'DELETE' }
    ),

  getPlanningSummary: (galleryId: string) =>
    request<PlanningSummary>(`/api/galleries/${galleryId}/planning`),

  getPublicInvitation: (token: string, slug?: string) =>
    request<{
      guest: {
        fullName: string;
        maxCompanions: number;
        attendanceStatus: string;
        confirmedCompanionCount: number;
        bringingChildren?: boolean;
        childCount?: number;
        childAges?: number[];
        inviteMessage?: string;
      };
      event: {
        title: string;
        description?: string;
        eventDate?: string;
        location?: string;
        slug: string;
        coverUrl?: string;
      };
    }>(
      `/api/public/invitations/${token}${slug ? `?slug=${encodeURIComponent(slug)}` : ''}`
    ),

  submitPublicRsvp: (
    token: string,
    body: {
      attending: boolean;
      companionCount?: number;
      bringingChildren?: boolean;
      childCount?: number;
      childAges?: number[];
    }
  ) =>
    request<{
      attendanceStatus: string;
      confirmedCompanionCount: number;
      bringingChildren?: boolean;
      childCount?: number;
      childAges?: number[];
      message: string;
    }>(`/api/public/invitations/${token}/rsvp`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getPublicGifts: (token: string) =>
    request<{ gifts: GiftInfo[] }>(`/api/public/invitations/${token}/gifts`),

  purchasePublicGift: (token: string, giftId: string) =>
    request<{ gift: GiftInfo; message: string }>(
      `/api/public/invitations/${token}/gifts/${giftId}/purchase`,
      { method: 'POST' }
    ),

  adminOverview: () => request<AdminOverview>('/api/admin/overview'),

  adminUsers: (page = 1, limit = 40) =>
    request<{
      users: AdminUserRow[];
      total: number;
      page: number;
      limit: number;
    }>(`/api/admin/users?page=${page}&limit=${limit}`),

  adminCreateUser: (body: { name: string; email: string; password: string }) =>
    request<{ user: AuthUser; message: string }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  adminSetUserStatus: (userId: string, status: 'ACTIVE' | 'BLOCKED') =>
    request<{ user: AuthUser; message: string }>(
      `/api/admin/users/${userId}/status`,
      { method: 'PATCH', body: JSON.stringify({ status }) }
    ),

  adminGrantAccess: (userId: string) =>
    request<{ message: string }>(`/api/admin/users/${userId}/grant-access`, {
      method: 'POST',
    }),

  adminExpireAccess: (userId: string) =>
    request<{ message: string; expiredCount: number }>(
      `/api/admin/users/${userId}/expire-access`,
      { method: 'POST' }
    ),

  adminPayments: (page = 1, limit = 40) =>
    request<{
      payments: AdminPaymentRow[];
      total: number;
      page: number;
      limit: number;
    }>(`/api/admin/payments?page=${page}&limit=${limit}`),

  adminGalleries: (page = 1, limit = 40) =>
    request<{
      galleries: AdminGalleryRow[];
      total: number;
      page: number;
      limit: number;
    }>(`/api/admin/galleries?page=${page}&limit=${limit}`),

  adminPurgeExpiredMedia: () =>
    request<{
      purgedUsers: number;
      checked: number;
      message: string;
    }>('/api/admin/purge-expired-media', { method: 'POST' }),
};

export interface AdminOverview {
  users: number;
  blockedUsers: number;
  activeSubscriptions: number;
  approvedPayments: number;
  galleries: number;
  photos: number;
  revenueCents: number;
  offer: AccessOffer;
  storage: {
    objectCount: number;
    usedBytes: number;
    limitBytes: number;
    freeBytes: number;
  } | null;
}

export interface AdminUserRow extends AuthUser {
  activeSubscription: SubscriptionInfo | null;
}

export interface AdminPaymentRow extends PaymentInfo {
  userId: string;
  userName?: string;
  userEmail?: string;
}

export interface AdminGalleryRow extends GalleryInfo {
  userName?: string;
  userEmail?: string;
}

export type { SubscriptionInfo, SubscriptionSummary };
