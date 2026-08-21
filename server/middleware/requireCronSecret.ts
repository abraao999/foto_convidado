import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

function headerValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export function secretsMatch(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function isAuthorizedCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }

  const authorization = headerValue(request.headers.authorization);
  const bearer = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';
  const headerSecret = headerValue(request.headers['x-cron-secret']).trim();

  return secretsMatch(bearer, secret) || secretsMatch(headerSecret, secret);
}

export function requireCronSecret(
  request: Request,
  response: Response,
  next: NextFunction
) {
  if (isAuthorizedCronRequest(request)) {
    next();
    return;
  }

  if (!process.env.CRON_SECRET?.trim() && process.env.NODE_ENV === 'production') {
    return response.status(503).json({
      error: 'CRON_SECRET não está configurada.',
    });
  }

  return response.status(401).json({ error: 'Não autorizado.' });
}
