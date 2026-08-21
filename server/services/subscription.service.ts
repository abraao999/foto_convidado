import { Types, type ClientSession } from 'mongoose';
import { platformConfig } from '../config/platform.js';
import { Subscription, type ISubscriptionDocument, type SubscriptionStatus } from '../models/Subscription.js';
import { User, type IUserDocument } from '../models/User.js';
import { daysUntilMediaPurge } from './media-cleanup.service.js';

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
/** Galeria publicada pode receber fotos de convidados enquanto o acesso estiver ativo ou no período de carência. */
export async function canAcceptGalleryUploads(userId: string): Promise<boolean> {
  const user = await User.findById(userId);
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (await hasActiveSubscription(userId)) return true;

  await syncExpiredSubscriptions();
  const last = await Subscription.findOne({ userId: user._id }).sort({
    expiresAt: -1,
  });
  if (!last?.expiresAt) return false;

  const graceEnd = new Date(last.expiresAt);
  graceEnd.setDate(graceEnd.getDate() + platformConfig.publicGalleryGraceDays);
  return new Date() <= graceEnd;
}

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
  status: SubscriptionStatus | 'NONE',
  options?: { daysUntilMediaPurge?: number | null }
): { level: SubscriptionAlertLevel; message: string } | null {
  if (status === 'NONE' || status === 'EXPIRED') {
    const untilPurge = options?.daysUntilMediaPurge;
    if (typeof untilPurge === 'number' && untilPurge > 0) {
      return {
        level: 'expired',
        message: `Seu acesso expirou. Renove em até ${untilPurge} dia(s) para não perder as fotos da galeria.`,
      };
    }
    if (untilPurge !== null && untilPurge !== undefined && untilPurge <= 0) {
      return {
        level: 'expired',
        message: `Seu acesso expirou e as fotos do período anterior foram removidas. Faça um novo pagamento para liberar mais ${platformConfig.accessDurationDays} dias.`,
      };
    }
    return {
      level: 'expired',
      message: `Seu acesso expirou. Faça um novo pagamento para liberar mais ${platformConfig.accessDurationDays} dias. Após ${platformConfig.publicGalleryGraceDays} dias sem renovação, as fotos são apagadas.`,
    };
  }

  if (daysRemaining === null) return null;

  const thresholds = [...platformConfig.subscriptionAlertDays].sort((a, b) => a - b);
  for (const days of thresholds) {
    if (daysRemaining <= days) {
      if (daysRemaining <= 1) {
        return { level: 'critical', message: 'Seu acesso vence amanhã. Renove para não perder o acesso nem as fotos.' };
      }
      if (daysRemaining <= 3) {
        return { level: 'critical', message: `Seu acesso vence em ${daysRemaining} dias. Renove agora para não perder as fotos.` };
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
 * Extensão atômica do documento ACTIVE (índice único parcial por usuário).
 * Se dois grants correm juntos sem ACTIVE, um cria e o outro estende.
 */
export async function grantAccess(
  userId: string,
  session?: ClientSession
) {
  const now = new Date();
  const days = platformConfig.accessDurationDays;
  const userOid = new Types.ObjectId(userId);
  const options = session ? { session } : {};

  const extended = await extendActiveSubscription(userOid, days, now, session);
  if (extended) {
    await clearMediaPurgedAt(userOid, session);
    return extended;
  }

  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + days);

  try {
    const [created] = await Subscription.create(
      [
        {
          userId: userOid,
          status: 'ACTIVE',
          accessDaysGranted: days,
          startsAt: now,
          expiresAt,
        },
      ],
      options
    );
    await clearMediaPurgedAt(userOid, session);
    return created!;
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 11000) throw error;
    const retried = await extendActiveSubscription(userOid, days, now, session);
    if (!retried) throw error;
    await clearMediaPurgedAt(userOid, session);
    return retried;
  }
}

async function extendActiveSubscription(
  userId: Types.ObjectId,
  days: number,
  now: Date,
  session?: ClientSession
) {
  return Subscription.findOneAndUpdate(
    {
      userId,
      status: 'ACTIVE',
      expiresAt: { $gt: now },
    },
    [
      {
        $set: {
          expiresAt: {
            $dateAdd: {
              startDate: '$expiresAt',
              unit: 'day',
              amount: days,
            },
          },
          accessDaysGranted: {
            $add: [{ $ifNull: ['$accessDaysGranted', 0] }, days],
          },
        },
      },
    ],
    { new: true, session }
  );
}

async function clearMediaPurgedAt(userId: Types.ObjectId, session?: ClientSession) {
  await User.updateOne(
    { _id: userId },
    { $unset: { mediaPurgedAt: 1 } },
    session ? { session } : undefined
  );
}

/**
 * Revoga os dias concedidos por um pagamento reembolsado.
 * O webhook chama esta função uma única vez, de forma transacional.
 */
export async function revokeAccess(
  subscriptionId: string,
  session?: ClientSession
) {
  if (!Types.ObjectId.isValid(subscriptionId)) return null;
  const days = platformConfig.accessDurationDays;
  return Subscription.findOneAndUpdate(
    {
      _id: new Types.ObjectId(subscriptionId),
      expiresAt: { $exists: true },
    },
    [
      {
        $set: {
          accessDaysGranted: {
            $max: [
              0,
              {
                $subtract: [
                  { $ifNull: ['$accessDaysGranted', days] },
                  days,
                ],
              },
            ],
          },
          expiresAt: {
            $dateSubtract: {
              startDate: '$expiresAt',
              unit: 'day',
              amount: days,
            },
          },
        },
      },
      {
        $set: {
          status: {
            $cond: [
              { $lte: ['$expiresAt', '$$NOW'] },
              'EXPIRED',
              '$status',
            ],
          },
        },
      },
    ],
    { new: true, session }
  );
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
  const untilPurge =
    last?.expiresAt && status !== 'ACTIVE'
      ? daysUntilMediaPurge(last.expiresAt)
      : null;
  const alert = getSubscriptionAlert(
    null,
    status === 'ACTIVE' ? 'EXPIRED' : (status as SubscriptionStatus | 'NONE'),
    { daysUntilMediaPurge: untilPurge }
  );

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
