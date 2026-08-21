import type { NextFunction, Request, Response } from 'express';
import { User, type IUserDocument } from '../models/User.js';
import { verifyToken, AUTH_COOKIE, type JwtPayload } from '../utils/jwt.js';

export function sessionMatchesUser(payload: JwtPayload, user: IUserDocument): boolean {
  const tokenVersion = user.tokenVersion ?? 0;
  const payloadVersion = payload.tv ?? 0;
  return payloadVersion === tokenVersion;
}

export async function authenticate(request: Request, response: Response, next: NextFunction) {
  const token = request.cookies?.[AUTH_COOKIE];
  if (!token) return response.status(401).json({ error: 'Autenticação necessária.' });

  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);
    if (!user || user.status === 'BLOCKED' || !sessionMatchesUser(payload, user)) {
      return response.status(401).json({ error: 'Sessão inválida ou conta bloqueada.' });
    }
    request.user = user;
    next();
  } catch {
    return response.status(401).json({ error: 'Sessão expirada ou inválida.' });
  }
}

export async function optionalAuthenticate(request: Request, _response: Response, next: NextFunction) {
  const token = request.cookies?.[AUTH_COOKIE];
  if (!token) return next();

  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);
    if (user && user.status !== 'BLOCKED' && sessionMatchesUser(payload, user)) {
      request.user = user;
    }
  } catch {
    // Ignora token inválido em rotas opcionais.
  }
  next();
}
