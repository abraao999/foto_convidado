import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import {
  createGuest,
  deleteGuest,
  listGuests,
  markInviteSent,
  updateGuest,
} from '../services/guest.service.js';
import { formatZodError } from '../utils/validation.js';
import type { GuestListFilter } from '../services/planning.helpers.js';

const router = Router({ mergeParams: true });

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas alterações. Aguarde um instante.' },
});

const guestSchema = z.object({
  fullName: z.string().trim().min(2, 'Informe o nome completo.').max(160),
  phone: z.string().trim().min(8, 'Informe o telefone.').max(40),
  email: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().email('E-mail inválido.').max(160).optional()
  ),
  maxCompanions: z.number().int().min(0).max(20).optional(),
  notes: z.string().trim().max(1000).optional(),
  inviteMessage: z.string().trim().max(1000).optional(),
  inviteStatus: z
    .enum(['PENDING', 'SENT', 'VIEWED', 'CONFIRMED', 'DECLINED'])
    .optional(),
  attendanceStatus: z.enum(['UNANSWERED', 'CONFIRMED', 'DECLINED']).optional(),
  confirmedCompanionCount: z.number().int().min(0).max(20).optional(),
});

function galleryIdFrom(request: Request) {
  const value = request.params.galleryId;
  return Array.isArray(value) ? value[0] : value;
}

function guestIdFrom(request: Request) {
  const value = request.params.guestId;
  return Array.isArray(value) ? value[0] : value;
}

function planningError(response: Response, error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Não foi possível processar.';
  const status = message.includes('não encontrad')
    ? 404
    : message.includes('cheia') || message.includes('suficientes')
      ? 409
      : 400;
  return response.status(status).json({ error: message });
}

router.get(
  '/',
  authenticate,
  async (request: Request, response: Response) => {
    try {
      const filter = String(request.query.filter ?? 'all') as GuestListFilter;
      const q = String(request.query.q ?? '');
      const result = await listGuests(
        request.user!._id.toString(),
        galleryIdFrom(request),
        { q, filter }
      );
      response.json(result);
    } catch (error) {
      planningError(response, error);
    }
  }
);

router.post(
  '/',
  authenticate,
  requireActiveSubscription,
  writeLimiter,
  async (request: Request, response: Response) => {
    const parsed = guestSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({ error: formatZodError(parsed.error) });
    }
    try {
      const guest = await createGuest(
        request.user!._id.toString(),
        galleryIdFrom(request),
        parsed.data
      );
      response.status(201).json({ guest, message: 'Convidado adicionado.' });
    } catch (error) {
      planningError(response, error);
    }
  }
);

router.patch(
  '/:guestId',
  authenticate,
  requireActiveSubscription,
  writeLimiter,
  async (request: Request, response: Response) => {
    const parsed = guestSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({ error: formatZodError(parsed.error) });
    }
    try {
      const guest = await updateGuest(
        request.user!._id.toString(),
        galleryIdFrom(request),
        guestIdFrom(request),
        parsed.data
      );
      response.json({ guest, message: 'Convidado atualizado.' });
    } catch (error) {
      planningError(response, error);
    }
  }
);

router.post(
  '/:guestId/mark-sent',
  authenticate,
  requireActiveSubscription,
  writeLimiter,
  async (request: Request, response: Response) => {
    try {
      const guest = await markInviteSent(
        request.user!._id.toString(),
        galleryIdFrom(request),
        guestIdFrom(request)
      );
      response.json({ guest, message: 'Convite marcado como enviado.' });
    } catch (error) {
      planningError(response, error);
    }
  }
);

router.delete(
  '/:guestId',
  authenticate,
  requireActiveSubscription,
  writeLimiter,
  async (request: Request, response: Response) => {
    try {
      const result = await deleteGuest(
        request.user!._id.toString(),
        galleryIdFrom(request),
        guestIdFrom(request)
      );
      response.json(result);
    } catch (error) {
      planningError(response, error);
    }
  }
);

export default router;
