import type { NextFunction, Request, Response } from 'express';
import { hasActiveSubscription } from '../services/subscription.service.js';

/**
 * Bloqueia recursos premium quando a assinatura não está ativa.
 * ADMIN sempre passa. Validação real no backend — nunca confiar só no frontend.
 */
export async function requireActiveSubscription(request: Request, response: Response, next: NextFunction) {
  if (!request.user) return response.status(401).json({ error: 'Autenticação necessária.' });

  if (request.user.role === 'ADMIN') return next();

  const active = await hasActiveSubscription(request.user._id.toString());
  if (!active) {
    return response.status(403).json({
      error: 'Assinatura expirada ou inativa. Renove seu plano para continuar.',
      code: 'SUBSCRIPTION_INACTIVE',
    });
  }

  next();
}
