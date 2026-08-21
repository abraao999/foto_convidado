import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import {
  applyOfferToGift,
  createGift,
  deleteGift,
  listGifts,
  refreshGiftPrice,
  searchGiftOffers,
  updateGift,
} from '../services/gift.service.js';
import { formatZodError } from '../utils/validation.js';

const router = Router({ mergeParams: true });

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas alterações. Aguarde um instante.' },
});

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas pesquisas. Aguarde um instante.' },
});

const giftSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do presente.').max(160),
  description: z.string().trim().max(1000).optional(),
  category: z.string().trim().max(80).optional(),
  desiredQuantity: z.number().int().min(1).max(99).optional(),
  imageUrl: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().url().max(2048).optional()
  ),
  productUrl: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().url().max(2048).optional()
  ),
  priceCents: z.number().int().min(0).optional(),
  store: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const searchSchema = z.object({
  query: z.string().trim().min(2).max(160),
});

function galleryIdFrom(request: Request) {
  const value = request.params.galleryId;
  return Array.isArray(value) ? value[0] : value;
}

function giftIdFrom(request: Request) {
  const value = request.params.giftId;
  return Array.isArray(value) ? value[0] : value;
}

function giftError(response: Response, error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Não foi possível processar.';
  const status = message.includes('não encontrado') ? 404 : 400;
  return response.status(status).json({ error: message });
}

router.get(
  '/',
  authenticate,
  async (request: Request, response: Response) => {
    try {
      const gifts = await listGifts(
        request.user!._id.toString(),
        galleryIdFrom(request)
      );
      response.json({ gifts });
    } catch (error) {
      giftError(response, error);
    }
  }
);

router.post(
  '/',
  authenticate,
  requireActiveSubscription,
  writeLimiter,
  async (request: Request, response: Response) => {
    const parsed = giftSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({ error: formatZodError(parsed.error) });
    }
    try {
      const gift = await createGift(
        request.user!._id.toString(),
        galleryIdFrom(request),
        parsed.data
      );
      response.status(201).json({ gift, message: 'Presente adicionado.' });
    } catch (error) {
      giftError(response, error);
    }
  }
);

router.post(
  '/search',
  authenticate,
  requireActiveSubscription,
  searchLimiter,
  async (request: Request, response: Response) => {
    const parsed = searchSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({ error: formatZodError(parsed.error) });
    }
    try {
      const result = await searchGiftOffers(
        request.user!._id.toString(),
        galleryIdFrom(request),
        parsed.data.query
      );
      response.json(result);
    } catch (error) {
      giftError(response, error);
    }
  }
);

router.patch(
  '/:giftId',
  authenticate,
  requireActiveSubscription,
  writeLimiter,
  async (request: Request, response: Response) => {
    const parsed = giftSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({ error: formatZodError(parsed.error) });
    }
    try {
      const gift = await updateGift(
        request.user!._id.toString(),
        galleryIdFrom(request),
        giftIdFrom(request),
        parsed.data
      );
      response.json({ gift, message: 'Presente atualizado.' });
    } catch (error) {
      giftError(response, error);
    }
  }
);

router.post(
  '/:giftId/refresh-price',
  authenticate,
  requireActiveSubscription,
  searchLimiter,
  async (request: Request, response: Response) => {
    try {
      const gift = await refreshGiftPrice(
        request.user!._id.toString(),
        galleryIdFrom(request),
        giftIdFrom(request)
      );
      response.json({ gift, message: 'Preços atualizados.' });
    } catch (error) {
      giftError(response, error);
    }
  }
);

router.post(
  '/:giftId/apply-offer',
  authenticate,
  requireActiveSubscription,
  writeLimiter,
  async (request: Request, response: Response) => {
    const offer = request.body as {
      provider?: string;
      title?: string;
      store?: string;
      priceCents?: number;
      previousPriceCents?: number;
      url?: string;
      imageUrl?: string;
    };
    if (
      !offer.url ||
      !offer.store ||
      !offer.title ||
      typeof offer.priceCents !== 'number'
    ) {
      return response.status(400).json({ error: 'Oferta inválida.' });
    }
    try {
      const gift = await applyOfferToGift(
        request.user!._id.toString(),
        galleryIdFrom(request),
        giftIdFrom(request),
        {
          provider: offer.provider || 'mercadolivre',
          title: offer.title,
          store: offer.store,
          priceCents: offer.priceCents,
          previousPriceCents: offer.previousPriceCents,
          url: offer.url,
          imageUrl: offer.imageUrl,
          queriedAt: new Date(),
        }
      );
      response.json({ gift, message: 'Oferta aplicada ao presente.' });
    } catch (error) {
      giftError(response, error);
    }
  }
);

router.delete(
  '/:giftId',
  authenticate,
  requireActiveSubscription,
  writeLimiter,
  async (request: Request, response: Response) => {
    try {
      const result = await deleteGift(
        request.user!._id.toString(),
        galleryIdFrom(request),
        giftIdFrom(request)
      );
      response.json(result);
    } catch (error) {
      giftError(response, error);
    }
  }
);

export default router;
