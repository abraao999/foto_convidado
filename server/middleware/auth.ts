import type { NextFunction, Request, Response } from 'express';
import { User } from '../models/User.js';
import { verifyToken, AUTH_COOKIE } from '../utils/jwt.js';

export async function authenticate(request: Request, response: Response, next: NextFunction) {
  const token = request.cookies?.[AUTH_COOKIE];
  if (!token) return response.status(401).json({ error: 'Autenticação necessária.' });

  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);
    if (!user || user.status === 'BLOCKED') {
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
    if (user && user.status !== 'BLOCKED') request.user = user;
  } catch {
    // Ignora token inválido em rotas opcionais.
  }
  next();
}
