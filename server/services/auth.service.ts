import crypto from 'node:crypto';
import { User, type IUserDocument } from '../models/User.js';
import { PasswordResetToken } from '../models/PasswordResetToken.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signToken } from '../utils/jwt.js';

export function serializeUser(user: IUserDocument) {
  return {
    id: user._id.toString(),
    name: user.name,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarDriveFileId
      ? `/api/profile/avatar?v=${user.updatedAt.getTime()}`
      : user.avatarUrl,
    eventName: user.eventName,
    eventDescription: user.eventDescription,
    eventDate: user.eventDate,
    location: user.location,
    publicSlug: user.publicSlug,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function resolveRole(email: string): 'USER' | 'ADMIN' {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (adminEmail && email.toLowerCase() === adminEmail) return 'ADMIN';
  return 'USER';
}

export async function registerUser(input: { name: string; email: string; password: string }) {
  const email = input.email.toLowerCase().trim();
  const existing = await User.findOne({ email });
  if (existing) throw new Error('Este e-mail já está cadastrado.');

  const passwordHash = await hashPassword(input.password);
  const user = await User.create({
    name: input.name.trim(),
    email,
    passwordHash,
    role: resolveRole(email),
  });

  return user;
}

export async function loginUser(email: string, password: string) {
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');
  if (!user) throw new Error('E-mail ou senha incorretos.');
  if (user.status === 'BLOCKED') throw new Error('Sua conta está bloqueada. Entre em contato com o suporte.');

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw new Error('E-mail ou senha incorretos.');

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

export function buildResetPasswordUrl(token: string) {
  const base = process.env.PUBLIC_URL ?? 'http://localhost:5173';
  return `${base.replace(/\/$/, '')}/redefinir-senha?token=${token}`;
}
