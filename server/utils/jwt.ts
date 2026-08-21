import jwt from 'jsonwebtoken';

export interface JwtPayload {
  sub: string;
  email: string;
  role: 'USER' | 'ADMIN';
  /** Versão da sessão; deve bater com User.tokenVersion. */
  tv?: number;
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não está configurada.');
  return secret;
}

/** Converte JWT_EXPIRES_IN (ex.: 7d, 24h, 3600) em milissegundos para o cookie. */
export function jwtExpiresInMs(): number {
  const raw = (process.env.JWT_EXPIRES_IN ?? '7d').trim();
  const match = /^(\d+)([smhd])?$/i.exec(raw);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return amount * (multipliers[unit] ?? 1000);
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
    maxAge: jwtExpiresInMs(),
  };
}

/** Opções alinhadas ao cookie de sessão, sem maxAge — necessário para limpar em produção. */
export function clearCookieOptions() {
  const { maxAge: _maxAge, ...options } = cookieOptions();
  return options;
}
