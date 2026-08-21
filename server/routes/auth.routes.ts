import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
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
import { AUTH_COOKIE, clearCookieOptions, cookieOptions } from '../utils/jwt.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  formatZodError,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../utils/validation.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Aguarde alguns minutos.' },
});

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitos pedidos de recuperação. Tente mais tarde.' },
});

router.post('/register', authLimiter, async (request: Request, response: Response) => {
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

router.post('/login', loginLimiter, async (request: Request, response: Response) => {
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
  response.clearCookie(AUTH_COOKIE, clearCookieOptions());
  response.json({ ok: true });
});

router.get('/me', authenticate, (request: Request, response: Response) => {
  response.json({ user: serializeUser(request.user!) });
});

router.post('/forgot-password', forgotLimiter, async (request: Request, response: Response) => {
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

router.post('/reset-password', authLimiter, async (request: Request, response: Response) => {
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
