import jwt from 'jsonwebtoken';

export interface JwtPayload {
  sub: string;
  email: string;
  role: 'USER' | 'ADMIN';
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não está configurada.');
  return secret;
}

export function signToken(payload: JwtPayload): string {
  const expiresIn = process.env.JWT_EXPIRES_IN ?? '7d';
  return jwt.sign(payload, jwtSecret(), { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, jwtSecret()) as JwtPayload;
}

export const AUTH_COOKIE = 'auth_token';

export function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

/** Opções alinhadas ao cookie de sessão, sem maxAge — necessário para limpar em produção. */
export function clearCookieOptions() {
  const { maxAge: _maxAge, ...options } = cookieOptions();
  return options;
}
