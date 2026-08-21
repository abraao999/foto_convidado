import mongoose, { Types } from 'mongoose';
import { platformConfig } from '../config/platform.js';
import {
  PaymentModel,
  type IPaymentDocument,
  type PaymentStatus,
} from '../models/Payment.js';
import type { IUserDocument } from '../models/User.js';
import {
  createCheckoutPreference,
  fetchMercadoPagoPayment,
} from './mercadopago.service.js';
import { grantAccess, revokeAccess } from './subscription.service.js';

export function serializePayment(payment: IPaymentDocument) {
  return {
    id: payment._id.toString(),
    subscriptionId: payment.subscriptionId?.toString(),
    externalPaymentId: payment.externalPaymentId,
    amountCents: payment.amountCents,
    status: payment.status,
    paymentMethod: payment.paymentMethod,
    paidAt: payment.paidAt,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

export async function createCheckout(user: IUserDocument) {
  const localPayment = await PaymentModel.create({
    userId: user._id,
    amountCents: platformConfig.accessPriceCents,
    status: 'PENDING',
  });

  try {
    const checkout = await createCheckoutPreference({
      localPaymentId: localPayment._id.toString(),
      payerEmail: user.email,
      amountCents: localPayment.amountCents,
      durationDays: platformConfig.accessDurationDays,
    });

    localPayment.checkoutPreferenceId = checkout.preferenceId;
    await localPayment.save();

    return {
      payment: localPayment,
      checkoutUrl: checkout.checkoutUrl,
    };
  } catch (error) {
    localPayment.status = 'CANCELED';
    localPayment.statusDetail = 'checkout_creation_failed';
    await localPayment.save();
    throw error;
  }
}

export async function listUserPayments(userId: string, limit = 50) {
  return PaymentModel.find({ userId: new Types.ObjectId(userId) })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 100));
}

export function mapMercadoPagoStatus(status?: string): PaymentStatus {
  switch (status) {
    case 'approved':
      return 'APPROVED';
    case 'rejected':
      return 'REJECTED';
    case 'cancelled':
    case 'cancelled_by_user':
      return 'CANCELED';
    case 'refunded':
    case 'charged_back':
      return 'REFUNDED';
    default:
      return 'PENDING';
  }
}

export type RefundAction = 'none' | 'partial' | 'full';

/**
 * Reembolso total ou chargeback revoga o acesso.
 * Reembolso parcial mantém a assinatura (o valor restante cobriu o período).
 */
export function resolveRefundAction(input: {
  amountCents: number;
  refundedCents: number;
  providerStatus?: string;
}): RefundAction {
  const status = input.providerStatus ?? '';
  if (status === 'charged_back' || status === 'refunded') return 'full';
  if (input.refundedCents >= input.amountCents && input.refundedCents > 0) {
    return 'full';
  }
  if (input.refundedCents > 0 && input.refundedCents < input.amountCents) {
    return 'partial';
  }
  return 'none';
}

/**
 * Consulta os dados oficiais no Mercado Pago e só então atualiza o banco.
 * Nenhum status ou valor recebido diretamente do navegador/webhook é confiado.
 */
export async function processMercadoPagoPayment(
  externalPaymentId: string
) {
  const providerPayment = await fetchMercadoPagoPayment(externalPaymentId);
  const localPaymentId = providerPayment.external_reference;

  if (
    !localPaymentId ||
    !mongoose.isValidObjectId(localPaymentId)
  ) {
    throw new Error('Pagamento sem referência local válida.');
  }

  const localPayment = await PaymentModel.findById(localPaymentId);
  if (!localPayment) throw new Error('Pagamento local não encontrado.');

  const receivedAmountCents = Math.round(
    (providerPayment.transaction_amount ?? 0) * 100
  );
  if (
    receivedAmountCents !== localPayment.amountCents ||
    providerPayment.currency_id !== 'BRL'
  ) {
    throw new Error('Valor ou moeda do pagamento não confere.');
  }

  const refundedCents = Math.round(
    (providerPayment.transaction_amount_refunded ?? 0) * 100
  );
  const refundAction = resolveRefundAction({
    amountCents: localPayment.amountCents,
    refundedCents,
    providerStatus: providerPayment.status,
  });

  let mappedStatus = mapMercadoPagoStatus(providerPayment.status);
  if (refundAction === 'full') mappedStatus = 'REFUNDED';

  const providerFields = {
    externalPaymentId: String(providerPayment.id),
    paymentMethod:
      providerPayment.payment_method_id ??
      providerPayment.payment_type_id,
    statusDetail:
      refundAction === 'partial'
        ? `partial_refund:${refundedCents}`
        : providerPayment.status_detail,
  };

  if (refundAction === 'partial') {
    localPayment.set(providerFields);
    if (!localPayment.accessGrantedAt) {
      localPayment.status = mappedStatus === 'APPROVED' ? 'APPROVED' : localPayment.status;
    }
    await localPayment.save();
    return PaymentModel.findById(localPaymentId);
  }

  if (mappedStatus === 'APPROVED') {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const payment = await PaymentModel.findOneAndUpdate(
          {
            _id: localPayment._id,
            accessGrantedAt: { $exists: false },
          },
          {
            $set: {
              ...providerFields,
              status: 'APPROVED',
              paidAt: providerPayment.date_approved
                ? new Date(providerPayment.date_approved)
                : new Date(),
              accessGrantedAt: new Date(),
            },
          },
          { new: true, session }
        );
        if (!payment) return;

        const subscription = await grantAccess(
          payment.userId.toString(),
          session
        );
        payment.subscriptionId = subscription._id as Types.ObjectId;
        await payment.save({ session });
      });
    } finally {
      await session.endSession();
    }
  } else if (mappedStatus === 'REFUNDED') {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const payment = await PaymentModel.findOneAndUpdate(
          {
            _id: localPayment._id,
            accessRevokedAt: { $exists: false },
          },
          {
            $set: {
              ...providerFields,
              status: 'REFUNDED',
              accessRevokedAt: new Date(),
            },
          },
          { new: true, session }
        );
        if (!payment) return;

        if (payment.accessGrantedAt && payment.subscriptionId) {
          await revokeAccess(payment.subscriptionId.toString(), session);
        }
      });
    } finally {
      await session.endSession();
    }
  } else if (!localPayment.accessGrantedAt) {
    localPayment.set(providerFields);
    localPayment.status = mappedStatus;
    await localPayment.save();
  }

  return PaymentModel.findById(localPaymentId);
}
