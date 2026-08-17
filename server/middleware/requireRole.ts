import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '../models/User.js';

export function requireRole(...roles: UserRole[]) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.user) return response.status(401).json({ error: 'Autenticação necessária.' });
    if (!roles.includes(request.user.role)) {
      return response.status(403).json({ error: 'Você não tem permissão para acessar este recurso.' });
    }
    next();
  };
}
