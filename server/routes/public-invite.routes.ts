import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import {
  getPublicInvitation,
  getInvitationCoverKey,
  submitPublicRsvp,
} from '../services/guest.service.js';
import {
  listPublicGifts,
  purchasePublicGift,
} from '../services/gift.service.js';
import { openStoredFile } from '../services/storage-read.service.js';
import { formatZodError } from '../utils/validation.js';

const router = Router();

const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas neste convite. Aguarde um instante.' },
});

const rsvpSchema = z.object({
  attending: z.boolean(),
  companionCount: z.number().int().min(0).max(20).optional(),
  bringingChildren: z.boolean().optional(),
  childCount: z.number().int().min(0).max(10).optional(),
  childAges: z.array(z.number().int().min(0).max(17)).max(10).optional(),
});

function tokenFrom(request: Request) {
  const value = request.params.token;
  return Array.isArray(value) ? value[0] : value;
}

function giftIdFrom(request: Request) {
  const value = request.params.giftId;
  return Array.isArray(value) ? value[0] : value;
}

function inviteError(response: Response, error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Convite não encontrado.';
  const status = message.includes('não encontrado')
    ? 404
    : message.includes('escolhido')
      ? 409
      : 400;
  return response.status(status).json({ error: message });
}

router.get(
  '/invitations/:token/cover',
  inviteLimiter,
  async (request: Request, response: Response) => {
    try {
      const storageKey = await getInvitationCoverKey(tokenFrom(request));
      const file = await openStoredFile(storageKey);
      response.setHeader('Content-Type', file.mimeType);
      response.setHeader('Cache-Control', 'private, max-age=300');
      file.stream.pipe(response);
    } catch (error) {
      inviteError(response, error);
    }
  }
);

router.get(
  '/invitations/:token',
  inviteLimiter,
  async (request: Request, response: Response) => {
    try {
      const slug =
        typeof request.query.slug === 'string' ? request.query.slug : undefined;
      const invitation = await getPublicInvitation(tokenFrom(request), slug);
      response.json(invitation);
    } catch (error) {
      inviteError(response, error);
    }
  }
);

router.post(
  '/invitations/:token/rsvp',
  inviteLimiter,
  async (request: Request, response: Response) => {
    const parsed = rsvpSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({ error: formatZodError(parsed.error) });
    }
    try {
      const result = await submitPublicRsvp(tokenFrom(request), parsed.data);
      response.json(result);
    } catch (error) {
      inviteError(response, error);
    }
  }
);

router.get(
  '/invitations/:token/gifts',
  inviteLimiter,
  async (request: Request, response: Response) => {
    try {
      const gifts = await listPublicGifts(tokenFrom(request));
      response.json({ gifts });
    } catch (error) {
      inviteError(response, error);
    }
  }
);

router.post(
  '/invitations/:token/gifts/:giftId/purchase',
  inviteLimiter,
  async (request: Request, response: Response) => {
    try {
      const result = await purchasePublicGift(
        tokenFrom(request),
        giftIdFrom(request)
      );
      response.json(result);
    } catch (error) {
      inviteError(response, error);
    }
  }
);

export default router;
