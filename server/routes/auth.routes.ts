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
  resendEmailVerification,
  serializeUser,
  verifyEmailWithToken,
} from '../services/auth.service.js';
import { AUTH_COOKIE, clearCookieOptions, cookieOptions } from '../utils/jwt.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  formatZodError,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
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

const verifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitos pedidos de confirmação. Tente mais tarde.' },
});

router.post('/register', authLimiter, async (request: Request, response: Response) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: formatZodError(parsed.error) });

  try {
    const result = await registerUser(parsed.data);

    if (result.verificationRequired) {
      return response.status(201).json({
        verificationRequired: true,
        email: result.user.email,
        message:
          'Conta criada. Enviamos um link de confirmação para o seu e-mail. Confirme antes de entrar.',
      });
    }

    const token = createSessionToken(result.user);
    response.cookie(AUTH_COOKIE, token, cookieOptions());
    response.status(201).json({
      verificationRequired: false,
      user: serializeUser(result.user),
      message: 'Conta criada com sucesso.',
    });
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Não foi possível criar a conta.',
    });
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
    response.status(401).json({
      error: error instanceof Error ? error.message : 'Não foi possível entrar.',
    });
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

  try {
    await requestPasswordReset(parsed.data.email);
  } catch (error) {
    console.error('Falha ao processar recuperação de senha:', error);
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
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Não foi possível redefinir a senha.',
    });
  }
});

router.post('/verify-email', verifyLimiter, async (request: Request, response: Response) => {
  const parsed = verifyEmailSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: formatZodError(parsed.error) });

  try {
    const user = await verifyEmailWithToken(parsed.data.token);
    const token = createSessionToken(user);
    response.cookie(AUTH_COOKIE, token, cookieOptions());
    response.json({
      user: serializeUser(user),
      message: 'E-mail confirmado com sucesso. Bem-vindo!',
    });
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Não foi possível confirmar o e-mail.',
    });
  }
});

router.post('/resend-verification', verifyLimiter, async (request: Request, response: Response) => {
  const parsed = forgotPasswordSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: formatZodError(parsed.error) });

  try {
    const result = await resendEmailVerification(parsed.data.email);
    if (result?.alreadyVerified) {
      return response.json({
        message: 'Este e-mail já está confirmado. Você pode entrar normalmente.',
      });
    }
  } catch (error) {
    console.error('Falha ao reenviar confirmação de e-mail:', error);
  }

  response.json({
    message: 'Se o e-mail estiver cadastrado e pendente, enviaremos um novo link de confirmação.',
  });
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
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Não foi possível alterar a senha.',
    });
  }
});

export default router;
