import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import {
  createGallery,
  listUserGalleries,
  serializeGallery,
} from '../services/gallery.service.js';
import { formatZodError } from '../utils/validation.js';

const router = Router();

const createGallerySchema = z.object({
  title: z.string().trim().min(2, 'Informe o nome do evento.').max(160),
  description: z.string().trim().max(1000).optional(),
  slug: z.string().trim().max(100).optional(),
  eventDate: z
    .string()
    .optional()
    .transform((value) =>
      value ? new Date(`${value}T12:00:00.000Z`) : undefined
    )
    .refine(
      (value) => !value || !Number.isNaN(value.getTime()),
      'Data inválida.'
    ),
  location: z.string().trim().max(240).optional(),
});

router.get(
  '/',
  authenticate,
  async (request: Request, response: Response) => {
    const galleries = await listUserGalleries(request.user!._id.toString());
    response.json({ galleries: galleries.map(serializeGallery) });
  }
);

router.post(
  '/',
  authenticate,
  requireActiveSubscription,
  async (request: Request, response: Response) => {
    const parsed = createGallerySchema.safeParse(request.body);
    if (!parsed.success) {
      return response
        .status(400)
        .json({ error: formatZodError(parsed.error) });
    }

    try {
      const gallery = await createGallery(
        request.user!._id.toString(),
        parsed.data
      );
      response.status(201).json({
        gallery: serializeGallery(gallery),
        message: 'Galeria criada com sucesso.',
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Não foi possível criar a galeria.';
      response
        .status(message.includes('já está em uso') ? 409 : 400)
        .json({ error: message });
    }
  }
);

export default router;
