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

function mapStatus(status?: string): PaymentStatus {
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

  let mappedStatus = mapStatus(providerPayment.status);
  const refundedCents = Math.round(
    (providerPayment.transaction_amount_refunded ?? 0) * 100
  );
  if (refundedCents >= localPayment.amountCents) {
    mappedStatus = 'REFUNDED';
  }

  const providerFields = {
    externalPaymentId: String(providerPayment.id),
    paymentMethod:
      providerPayment.payment_method_id ??
      providerPayment.payment_type_id,
    statusDetail: providerPayment.status_detail,
  };

  if (mappedStatus === 'APPROVED') {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const payment = await PaymentModel.findById(localPaymentId).session(
          session
        );
        if (!payment) throw new Error('Pagamento local não encontrado.');
        if (payment.accessGrantedAt) return;

        const subscription = await grantAccess(
          payment.userId.toString(),
          session
        );

        payment.set(providerFields);
        payment.status = 'APPROVED';
        payment.subscriptionId = subscription._id as Types.ObjectId;
        payment.paidAt = providerPayment.date_approved
          ? new Date(providerPayment.date_approved)
          : new Date();
        payment.accessGrantedAt = new Date();
        await payment.save({ session });
      });
    } finally {
      await session.endSession();
    }
  } else if (mappedStatus === 'REFUNDED') {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const payment = await PaymentModel.findById(localPaymentId).session(
          session
        );
        if (!payment) throw new Error('Pagamento local não encontrado.');
        if (payment.accessRevokedAt) return;

        payment.set(providerFields);
        payment.status = 'REFUNDED';

        if (payment.accessGrantedAt && payment.subscriptionId) {
          await revokeAccess(payment.subscriptionId.toString(), session);
          payment.accessRevokedAt = new Date();
        }

        await payment.save({ session });
      });
    } finally {
      await session.endSession();
    }
  } else {
    // Eventos atrasados não podem rebaixar um pagamento já aprovado.
    if (!localPayment.accessGrantedAt) {
      localPayment.set(providerFields);
      localPayment.status = mappedStatus;
      await localPayment.save();
    }
  }

  return PaymentModel.findById(localPaymentId);
}
