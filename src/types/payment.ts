export type PaymentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELED'
  | 'REFUNDED';

export interface PaymentInfo {
  id: string;
  subscriptionId?: string;
  externalPaymentId?: string;
  amountCents: number;
  status: PaymentStatus;
  paymentMethod?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const paymentStatusLabel: Record<PaymentStatus, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  CANCELED: 'Cancelado',
  REFUNDED: 'Reembolsado',
};
