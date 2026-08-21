import { Types } from 'mongoose';
import { Gallery } from '../models/Gallery.js';
import { PaymentModel } from '../models/Payment.js';
import { Photo } from '../models/Photo.js';
import { Subscription } from '../models/Subscription.js';
import { User, type UserStatus } from '../models/User.js';
import { serializeUser } from './auth.service.js';
import { serializeGallery } from './gallery.service.js';
import { serializePayment } from './payment.service.js';
import {
  getAccessOffer,
  grantAccess,
  serializeSubscription,
  syncExpiredSubscriptions,
} from './subscription.service.js';
import { hashPassword } from '../utils/password.js';
import { getBucketUsage } from './r2.service.js';
import { platformConfig } from '../config/platform.js';

export const ADMIN_LIST_PAGE_SIZE = 40;

export function adminListPaging(pageRaw?: number, limitRaw?: number) {
  const page =
    typeof pageRaw === 'number' && Number.isFinite(pageRaw) && pageRaw >= 1
      ? Math.floor(pageRaw)
      : 1;
  const limit =
    typeof limitRaw === 'number' && Number.isFinite(limitRaw) && limitRaw >= 1
      ? Math.min(80, Math.floor(limitRaw))
      : ADMIN_LIST_PAGE_SIZE;
  return { page, limit, skip: (page - 1) * limit };
}

export async function getAdminOverview() {
  await syncExpiredSubscriptions();
  const now = new Date();

  const [
    users,
    blockedUsers,
    activeSubscriptions,
    approvedPayments,
    galleries,
    photos,
    revenueAgg,
    storage,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ status: 'BLOCKED' }),
    Subscription.countDocuments({
      status: 'ACTIVE',
      expiresAt: { $gt: now },
    }),
    PaymentModel.countDocuments({ status: 'APPROVED' }),
    Gallery.countDocuments({ status: { $ne: 'ARCHIVED' } }),
    Photo.countDocuments(),
    PaymentModel.aggregate<{ totalCents: number }>([
      { $match: { status: 'APPROVED' } },
      { $group: { _id: null, totalCents: { $sum: '$amountCents' } } },
    ]),
    getBucketUsage().catch((error) => {
      console.warn('Falha ao medir uso do R2:', error);
      return null;
    }),
  ]);

  const limitBytes = platformConfig.maxStorageBytes;
  const usedBytes = storage?.usedBytes ?? 0;

  return {
    users,
    blockedUsers,
    activeSubscriptions,
    approvedPayments,
    galleries,
    photos,
    revenueCents: revenueAgg[0]?.totalCents ?? 0,
    offer: getAccessOffer(),
    storage: storage
      ? {
          objectCount: storage.objectCount,
          usedBytes,
          limitBytes,
          freeBytes: Math.max(0, limitBytes - usedBytes),
        }
      : null,
  };
}

export async function createAdminUser(input: {
  name: string;
  email: string;
  password: string;
}) {
  const email = input.email.toLowerCase().trim();
  const existing = await User.findOne({ email });
  if (existing) {
    throw new Error('Este e-mail já está cadastrado.');
  }

  const user = await User.create({
    name: input.name.trim(),
    email,
    passwordHash: await hashPassword(input.password),
    role: 'ADMIN',
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
  });

  return serializeUser(user);
}

export async function listAdminUsers(paging = adminListPaging()) {
  await syncExpiredSubscriptions();
  const now = new Date();
  const [total, users] = await Promise.all([
    User.countDocuments(),
    User.find().sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit),
  ]);

  const userIds = users.map((user) => user._id);
  const activeSubs = await Subscription.find({
    userId: { $in: userIds },
    status: 'ACTIVE',
    expiresAt: { $gt: now },
  }).sort({ expiresAt: -1 });

  const subByUser = new Map<string, (typeof activeSubs)[number]>();
  for (const sub of activeSubs) {
    const key = sub.userId.toString();
    if (!subByUser.has(key)) subByUser.set(key, sub);
  }

  return {
    users: users.map((user) => {
      const sub = subByUser.get(user._id.toString());
      return {
        ...serializeUser(user),
        activeSubscription: sub
          ? serializeSubscription(
              sub,
              Math.max(
                0,
                Math.ceil(
                  (sub.expiresAt!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
                )
              )
            )
          : null,
      };
    }),
    total,
    page: paging.page,
    limit: paging.limit,
  };
}

export async function setUserStatus(input: {
  adminId: string;
  userId: string;
  status: UserStatus;
}) {
  if (!Types.ObjectId.isValid(input.userId)) {
    throw new Error('Usuário não encontrado.');
  }
  if (input.adminId === input.userId && input.status === 'BLOCKED') {
    throw new Error('Você não pode bloquear a si mesmo.');
  }

  const user = await User.findById(input.userId);
  if (!user) throw new Error('Usuário não encontrado.');
  if (user.role === 'ADMIN' && input.status === 'BLOCKED') {
    throw new Error('Não é possível bloquear uma conta administrador.');
  }

  user.status = input.status;
  await user.save();
  return serializeUser(user);
}

export async function adminGrantAccess(userId: string) {
  if (!Types.ObjectId.isValid(userId)) {
    throw new Error('Usuário não encontrado.');
  }
  const user = await User.findById(userId);
  if (!user) throw new Error('Usuário não encontrado.');

  const subscription = await grantAccess(userId);
  return {
    user: serializeUser(user),
    subscription: serializeSubscription(subscription),
  };
}

export async function adminExpireAccess(userId: string) {
  if (!Types.ObjectId.isValid(userId)) {
    throw new Error('Usuário não encontrado.');
  }
  const user = await User.findById(userId);
  if (!user) throw new Error('Usuário não encontrado.');

  const now = new Date();
  const result = await Subscription.updateMany(
    {
      userId: new Types.ObjectId(userId),
      status: 'ACTIVE',
      expiresAt: { $gt: now },
    },
    { $set: { status: 'EXPIRED', expiresAt: now } }
  );

  return {
    user: serializeUser(user),
    expiredCount: result.modifiedCount,
  };
}

export async function listAdminPayments(paging = adminListPaging()) {
  const [total, payments] = await Promise.all([
    PaymentModel.countDocuments(),
    PaymentModel.find()
      .sort({ createdAt: -1 })
      .skip(paging.skip)
      .limit(paging.limit),
  ]);

  const userIds = [
    ...new Set(payments.map((payment) => payment.userId.toString())),
  ];
  const users = await User.find({
    _id: { $in: userIds.map((id) => new Types.ObjectId(id)) },
  }).select('name email');
  const userById = new Map(
    users.map((user) => [
      user._id.toString(),
      { name: user.name, email: user.email },
    ])
  );

  return {
    payments: payments.map((payment) => {
      const owner = userById.get(payment.userId.toString());
      return {
        ...serializePayment(payment),
        userId: payment.userId.toString(),
        userName: owner?.name,
        userEmail: owner?.email,
      };
    }),
    total,
    page: paging.page,
    limit: paging.limit,
  };
}

export async function listAdminGalleries(paging = adminListPaging()) {
  const [total, galleries] = await Promise.all([
    Gallery.countDocuments(),
    Gallery.find()
      .sort({ createdAt: -1 })
      .skip(paging.skip)
      .limit(paging.limit),
  ]);

  const userIds = [
    ...new Set(galleries.map((gallery) => gallery.userId.toString())),
  ];
  const users = await User.find({
    _id: { $in: userIds.map((id) => new Types.ObjectId(id)) },
  }).select('name email');
  const userById = new Map(
    users.map((user) => [
      user._id.toString(),
      { name: user.name, email: user.email },
    ])
  );

  return {
    galleries: galleries.map((gallery) => {
      const owner = userById.get(gallery.userId.toString());
      return {
        ...serializeGallery(gallery),
        userName: owner?.name,
        userEmail: owner?.email,
      };
    }),
    total,
    page: paging.page,
    limit: paging.limit,
  };
}
