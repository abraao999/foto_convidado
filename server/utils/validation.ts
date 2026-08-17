import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome.').max(120),
  email: z.string().trim().email('E-mail inválido.').max(254),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.').max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().email('E-mail inválido.'),
  password: z.string().min(1, 'Informe a senha.'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('E-mail inválido.'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token inválido.'),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.').max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual.'),
  newPassword: z.string().min(8, 'A nova senha deve ter pelo menos 8 caracteres.').max(128),
});

export function formatZodError(error: z.ZodError): string {
  return error.errors[0]?.message ?? 'Dados inválidos.';
}
