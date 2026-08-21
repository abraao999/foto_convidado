import crypto from 'node:crypto';
import { User, type IUserDocument } from '../models/User.js';
import { PasswordResetToken } from '../models/PasswordResetToken.js';
import { EmailVerificationToken } from '../models/EmailVerificationToken.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signToken } from '../utils/jwt.js';
import {
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
} from './email.service.js';

export function serializeUser(user: IUserDocument) {
  return {
    id: user._id.toString(),
    name: user.name,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarStorageKey
      ? `/api/profile/avatar?v=${user.updatedAt.getTime()}`
      : user.avatarUrl,
    eventName: user.eventName,
    eventDescription: user.eventDescription,
    eventDate: user.eventDate,
    location: user.location,
    publicSlug: user.publicSlug,
    role: user.role,
    status: user.status,
    emailVerified: isEmailVerified(user),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/** null = pendente; Date ou ausente (contas antigas) = verificado. */
export function isEmailVerified(user: IUserDocument): boolean {
  return user.emailVerifiedAt !== null;
}

function resolveRole(email: string): 'USER' | 'ADMIN' {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (adminEmail && email.toLowerCase() === adminEmail) return 'ADMIN';
  return 'USER';
}

function publicBaseUrl(): string {
  return (process.env.PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, '');
}

export function buildResetPasswordUrl(token: string) {
  return `${publicBaseUrl()}/redefinir-senha?token=${token}`;
}

export function buildVerifyEmailUrl(token: string) {
  return `${publicBaseUrl()}/verificar-email?token=${token}`;
}

async function createEmailVerificationToken(userId: IUserDocument['_id']) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await EmailVerificationToken.deleteMany({ userId });
  await EmailVerificationToken.create({ userId, tokenHash, expiresAt });

  return rawToken;
}

export async function registerUser(input: { name: string; email: string; password: string }) {
  const email = input.email.toLowerCase().trim();
  const existing = await User.findOne({ email });
  if (existing) throw new Error('Este e-mail já está cadastrado.');

  const role = resolveRole(email);
  const passwordHash = await hashPassword(input.password);
  const autoVerified = role === 'ADMIN';

  const user = await User.create({
    name: input.name.trim(),
    email,
    passwordHash,
    role,
    emailVerifiedAt: autoVerified ? new Date() : null,
  });

  if (autoVerified) {
    return { user, verificationRequired: false as const };
  }

  try {
    const rawToken = await createEmailVerificationToken(user._id);
    const verifyUrl = buildVerifyEmailUrl(rawToken);
    await sendEmailVerificationEmail(user.email, verifyUrl, user.name);
  } catch (error) {
    await EmailVerificationToken.deleteMany({ userId: user._id });
    await User.deleteOne({ _id: user._id });
    throw error;
  }

  return { user, verificationRequired: true as const };
}

export async function loginUser(email: string, password: string) {
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');
  if (!user) throw new Error('E-mail ou senha incorretos.');
  if (user.status === 'BLOCKED') {
    throw new Error('Sua conta está bloqueada. Entre em contato com o suporte.');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw new Error('E-mail ou senha incorretos.');

  if (user.emailVerifiedAt === null) {
    throw new Error(
      'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada ou reenvie o link.'
    );
  }

  return user;
}

export function createSessionToken(user: IUserDocument) {
  return signToken({
    sub: user._id.toString(),
    email: user.email,
    role: user.role,
  });
}

export async function requestPasswordReset(email: string) {
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) return null;

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await PasswordResetToken.deleteMany({ userId: user._id });
  await PasswordResetToken.create({ userId: user._id, tokenHash, expiresAt });

  const resetUrl = buildResetPasswordUrl(rawToken);
  await sendPasswordResetEmail(user.email, resetUrl);

  return { user, rawToken };
}

export async function resetPasswordWithToken(rawToken: string, newPassword: string) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const record = await PasswordResetToken.findOne({
    tokenHash,
    usedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });

  if (!record) throw new Error('Link de recuperação inválido ou expirado.');

  const user = await User.findById(record.userId).select('+passwordHash');
  if (!user) throw new Error('Usuário não encontrado.');

  user.passwordHash = await hashPassword(newPassword);
  if (user.emailVerifiedAt === null) {
    user.emailVerifiedAt = new Date();
  }
  await user.save();
  record.usedAt = new Date();
  await record.save();

  return user;
}

export async function changeUserPassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw new Error('Usuário não encontrado.');

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw new Error('Senha atual incorreta.');

  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  return user;
}

export async function verifyEmailWithToken(rawToken: string) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const record = await EmailVerificationToken.findOne({
    tokenHash,
    usedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });

  if (!record) throw new Error('Link de confirmação inválido ou expirado.');

  const user = await User.findById(record.userId);
  if (!user) throw new Error('Usuário não encontrado.');

  if (user.emailVerifiedAt === null || !user.emailVerifiedAt) {
    user.emailVerifiedAt = new Date();
    await user.save();
  }

  record.usedAt = new Date();
  await record.save();
  await EmailVerificationToken.deleteMany({
    userId: user._id,
    _id: { $ne: record._id },
  });

  return user;
}

export async function resendEmailVerification(email: string) {
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) return null;

  if (user.emailVerifiedAt !== null) {
    return { alreadyVerified: true as const, user };
  }

  const rawToken = await createEmailVerificationToken(user._id);
  const verifyUrl = buildVerifyEmailUrl(rawToken);
  await sendEmailVerificationEmail(user.email, verifyUrl, user.name);

  return { alreadyVerified: false as const, user };
}
