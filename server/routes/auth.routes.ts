import { Router, type Request, type Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  changeUserPassword,
  createSessionToken,
  loginUser,
  registerUser,
  requestPasswordReset,
  resetPasswordWithToken,
  serializeUser,
  buildResetPasswordUrl,
} from '../services/auth.service.js';
import { AUTH_COOKIE, cookieOptions } from '../utils/jwt.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  formatZodError,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../utils/validation.js';

const router = Router();

router.post('/register', async (request: Request, response: Response) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: formatZodError(parsed.error) });

  try {
    const user = await registerUser(parsed.data);
    const token = createSessionToken(user);
    response.cookie(AUTH_COOKIE, token, cookieOptions());
    response.status(201).json({ user: serializeUser(user) });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Não foi possível criar a conta.' });
  }
});

router.post('/login', async (request: Request, response: Response) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: formatZodError(parsed.error) });

  try {
    const user = await loginUser(parsed.data.email, parsed.data.password);
    const token = createSessionToken(user);
    response.cookie(AUTH_COOKIE, token, cookieOptions());
    response.json({ user: serializeUser(user) });
  } catch (error) {
    response.status(401).json({ error: error instanceof Error ? error.message : 'Não foi possível entrar.' });
  }
});

router.post('/logout', (_request: Request, response: Response) => {
  response.clearCookie(AUTH_COOKIE, { path: '/' });
  response.json({ ok: true });
});

router.get('/me', authenticate, (request: Request, response: Response) => {
  response.json({ user: serializeUser(request.user!) });
});

router.post('/forgot-password', async (request: Request, response: Response) => {
  const parsed = forgotPasswordSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: formatZodError(parsed.error) });

  const result = await requestPasswordReset(parsed.data.email);

  if (result) {
    const resetUrl = buildResetPasswordUrl(result.rawToken);
    if (process.env.NODE_ENV !== 'production') {
      console.info('[auth] Link de recuperação de senha:', resetUrl);
    }
  }

  response.json({
    message: 'Se o e-mail estiver cadastrado, enviaremos instruções para redefinir a senha.',
  });
});

router.post('/reset-password', async (request: Request, response: Response) => {
  const parsed = resetPasswordSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: formatZodError(parsed.error) });

  try {
    const user = await resetPasswordWithToken(parsed.data.token, parsed.data.password);
    const token = createSessionToken(user);
    response.cookie(AUTH_COOKIE, token, cookieOptions());
    response.json({ user: serializeUser(user), message: 'Senha redefinida com sucesso.' });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Não foi possível redefinir a senha.' });
  }
});

router.post('/change-password', authenticate, async (request: Request, response: Response) => {
  const parsed = changePasswordSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: formatZodError(parsed.error) });

  try {
    const user = await changeUserPassword(
      request.user!._id.toString(),
      parsed.data.currentPassword,
      parsed.data.newPassword
    );
    const token = createSessionToken(user);
    response.cookie(AUTH_COOKIE, token, cookieOptions());
    response.json({ user: serializeUser(user), message: 'Senha alterada com sucesso.' });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Não foi possível alterar a senha.' });
  }
});

export default router;
