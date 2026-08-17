import type { SubscriptionInfo, SubscriptionSummary } from '../types/subscription';
import type { PaymentInfo } from '../types/payment';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
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
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
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
