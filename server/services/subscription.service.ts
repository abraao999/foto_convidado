import { Types, type ClientSession } from 'mongoose';
import { platformConfig } from '../config/platform.js';
import { Subscription, type ISubscriptionDocument, type SubscriptionStatus } from '../models/Subscription.js';
import { User, type IUserDocument } from '../models/User.js';

export interface ActiveSubscriptionResult {
  subscription: ISubscriptionDocument;
  daysRemaining: number;
}

/** Marca assinaturas ACTIVE vencidas como EXPIRED. */
export async function syncExpiredSubscriptions(): Promise<number> {
  const now = new Date();
  const result = await Subscription.updateMany(
    { status: 'ACTIVE', expiresAt: { $lte: now } },
    { $set: { status: 'EXPIRED' } }
  );
  return result.modifiedCount;
}

/**
 * Função central de controle de acesso.
 * ADMIN sempre tem acesso. Usuários comuns precisam de assinatura ACTIVE e não vencida.
 */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const user = await User.findById(userId);
  if (!user) return false;
  if (user.role === 'ADMIN') return true;

  await syncExpiredSubscriptions();

  const now = new Date();
  const subscription = await Subscription.findOne({
    userId: new Types.ObjectId(userId),
    status: 'ACTIVE',
    expiresAt: { $gt: now },
  });

  return Boolean(subscription);
}

export async function getActiveSubscription(userId: string): Promise<ActiveSubscriptionResult | null> {
  const user = await User.findById(userId);
  if (!user) return null;

  await syncExpiredSubscriptions();

  const now = new Date();
  const subscription = await Subscription.findOne({
    userId: new Types.ObjectId(userId),
    status: 'ACTIVE',
    expiresAt: { $gt: now },
  });

  if (!subscription || !subscription.expiresAt) return null;

  const daysRemaining = Math.max(
    0,
    Math.ceil((subscription.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  );

  return { subscription, daysRemaining };
}

export async function listUserSubscriptions(userId: string) {
  return Subscription.find({ userId: new Types.ObjectId(userId) })
    .sort({ createdAt: -1 });
}

export function serializeSubscription(
  subscription: ISubscriptionDocument,
  daysRemaining?: number
) {
  return {
    id: subscription._id.toString(),
    userId: subscription.userId.toString(),
    status: subscription.status as SubscriptionStatus,
    accessDaysGranted:
      subscription.accessDaysGranted ?? platformConfig.accessDurationDays,
    startsAt: subscription.startsAt,
    expiresAt: subscription.expiresAt,
    daysRemaining,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
  };
}

export type SubscriptionAlertLevel = 'info' | 'warning' | 'critical' | 'expired';

export function getSubscriptionAlert(
  daysRemaining: number | null,
  status: SubscriptionStatus | 'NONE'
): { level: SubscriptionAlertLevel; message: string } | null {
  if (status === 'NONE' || status === 'EXPIRED') {
    return {
      level: 'expired',
      message: `Seu acesso expirou. Faça um novo pagamento para liberar mais ${platformConfig.accessDurationDays} dias.`,
    };
  }

  if (daysRemaining === null) return null;

  const thresholds = [...platformConfig.subscriptionAlertDays].sort((a, b) => a - b);
  for (const days of thresholds) {
    if (daysRemaining <= days) {
      if (daysRemaining <= 1) {
        return { level: 'critical', message: 'Seu acesso vence amanhã. Renove para não perder o acesso.' };
      }
      if (daysRemaining <= 3) {
        return { level: 'critical', message: `Seu acesso vence em ${daysRemaining} dias. Renove agora.` };
      }
      if (daysRemaining <= 7) {
        return { level: 'warning', message: `Seu acesso vence em ${daysRemaining} dias.` };
      }
      return { level: 'info', message: `Seu acesso vence em ${daysRemaining} dias.` };
    }
  }

  return null;
}

/**
 * Libera ou renova o acesso depois de pagamento confirmado.
 * Se o usuário ainda tem acesso, os novos dias são somados ao vencimento atual.
 * Caso contrário, a contagem começa agora.
 */
export async function grantAccess(
  userId: string,
  session?: ClientSession
) {
  const now = new Date();
  const query = Subscription.findOne({
    userId: new Types.ObjectId(userId),
    status: 'ACTIVE',
    expiresAt: { $gt: now },
  }).sort({ expiresAt: -1 });
  if (session) query.session(session);
  const existing = await query;

  if (existing?.expiresAt) {
    const expiresAt = new Date(existing.expiresAt);
    expiresAt.setDate(expiresAt.getDate() + platformConfig.accessDurationDays);
    existing.expiresAt = expiresAt;
    existing.accessDaysGranted =
      (existing.accessDaysGranted ?? 0) + platformConfig.accessDurationDays;
    return existing.save({ session });
  }

  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + platformConfig.accessDurationDays);

  const subscription = new Subscription({
    userId: new Types.ObjectId(userId),
    status: 'ACTIVE',
    accessDaysGranted: platformConfig.accessDurationDays,
    startsAt: now,
    expiresAt,
  });
  return subscription.save({ session });
}

/**
 * Revoga os dias concedidos por um pagamento reembolsado.
 * O webhook chama esta função uma única vez, de forma transacional.
 */
export async function revokeAccess(
  subscriptionId: string,
  session?: ClientSession
) {
  const query = Subscription.findById(subscriptionId);
  if (session) query.session(session);
  const subscription = await query;
  if (!subscription?.expiresAt) return null;

  const expiresAt = new Date(subscription.expiresAt);
  expiresAt.setDate(
    expiresAt.getDate() - platformConfig.accessDurationDays
  );

  subscription.accessDaysGranted = Math.max(
    0,
    (subscription.accessDaysGranted ?? platformConfig.accessDurationDays) -
      platformConfig.accessDurationDays
  );
  subscription.expiresAt = expiresAt;

  if (expiresAt <= new Date()) {
    subscription.status = 'EXPIRED';
  }

  return subscription.save({ session });
}

export function getAccessOffer() {
  return {
    priceCents: platformConfig.accessPriceCents,
    durationDays: platformConfig.accessDurationDays,
    maxGalleries: platformConfig.maxGalleries,
    maxStorageBytes: platformConfig.maxStorageBytes,
  };
}

export async function getSubscriptionSummary(user: IUserDocument) {
  await syncExpiredSubscriptions();

  if (user.role === 'ADMIN') {
    return {
      hasAccess: true,
      isAdmin: true,
      subscription: null,
      offer: getAccessOffer(),
      alert: null,
    };
  }

  const active = await getActiveSubscription(user._id.toString());

  if (active) {
    const alert = getSubscriptionAlert(active.daysRemaining, 'ACTIVE');
    return {
      hasAccess: true,
      isAdmin: false,
      subscription: serializeSubscription(active.subscription, active.daysRemaining),
      offer: getAccessOffer(),
      alert,
    };
  }

  const last = await Subscription.findOne({ userId: user._id }).sort({ createdAt: -1 });
  const status = last?.status ?? 'NONE';
  const alert = getSubscriptionAlert(null, status === 'ACTIVE' ? 'EXPIRED' : (status as SubscriptionStatus | 'NONE'));

  return {
    hasAccess: false,
    isAdmin: false,
    subscription: last ? serializeSubscription(last, 0) : null,
    offer: getAccessOffer(),
    alert: alert ?? {
      level: 'expired' as const,
      message: `Você ainda não possui acesso ativo. Faça o pagamento para liberar ${platformConfig.accessDurationDays} dias.`,
    },
  };
}
