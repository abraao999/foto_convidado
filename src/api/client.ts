import type { SubscriptionInfo, SubscriptionSummary } from '../types/subscription';
import type { PaymentInfo } from '../types/payment';
import type { GalleryInfo } from '../types/gallery';
import type { PhotoInfo, PhotoStats } from '../types/photo';

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
    request<{ user: AuthUser }>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),

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

  getGalleryPhotos: (galleryId: string) =>
    request<{ photos: PhotoInfo[] }>(
      `/api/photos/gallery/${galleryId}`
    ),

  downloadGalleryZip: async (
    galleryId: string,
    photoIds: string[],
    suggestedName = 'galeria-fotos.zip'
  ) => {
    const ids = photoIds.join(',');
    const url = `/api/photos/gallery/${encodeURIComponent(
      galleryId
    )}/zip?ids=${encodeURIComponent(ids)}`;

    type SaveFilePicker = (options: {
      suggestedName?: string;
      types?: Array<{
        description: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<FileSystemFileHandle>;

    const savePicker = (
      window as Window & { showSaveFilePicker?: SaveFilePicker }
    ).showSaveFilePicker;

    if (typeof savePicker === 'function') {
      let fileHandle: FileSystemFileHandle;
      try {
        fileHandle = await savePicker({
          suggestedName,
          types: [
            {
              description: 'Arquivo ZIP',
              accept: { 'application/zip': ['.zip'] },
            },
          ],
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new Error('Download cancelado.');
        }
        fileHandle = undefined as unknown as FileSystemFileHandle;
      }

      if (fileHandle) {
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as ApiError;
          throw new Error(
            data.error ?? data.message ?? 'Não foi possível gerar o ZIP.'
          );
        }

        const writable = await fileHandle.createWritable();
        try {
          if (response.body) {
            await response.body.pipeTo(writable);
          } else {
            await writable.write(await response.blob());
            await writable.close();
          }
        } catch (error) {
          try {
            await writable.abort();
          } catch {
            // ignore abort errors
          }
          throw error;
        }
        return;
      }
    }

    // Fallback (Safari/Firefox): navegação GET no documento principal.
    // Não usa iframe — navegadores modernos bloqueiam download em iframe oculto.
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.rel = 'noopener';
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
};

export type { SubscriptionInfo, SubscriptionSummary };
