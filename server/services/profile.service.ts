import { User } from '../models/User.js';

export interface ProfileUpdateInput {
  name: string;
  lastName?: string;
  phone?: string;
}

export function normalizeSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export async function updateProfile(
  userId: string,
  input: ProfileUpdateInput
) {
  const user = await User.findById(userId);
  if (!user) throw new Error('Usuário não encontrado.');

  user.name = input.name.trim();
  user.lastName = input.lastName?.trim() || undefined;
  user.phone = input.phone?.trim() || undefined;

  await user.save();
  return user;
}
