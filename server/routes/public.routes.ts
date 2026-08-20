import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import {
  getPublishedGalleryBySlug,
} from '../services/gallery.service.js';
import { openStoredFile } from '../services/storage-read.service.js';
import {
  getPublicGalleryUploadInfo,
  initPublicPhotoUpload,
  uploadPhotoChunk,
} from '../services/photo.service.js';
import { chunkUpload } from '../utils/upload.js';
import { formatZodError } from '../utils/validation.js';

const router = Router();

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas solicitações. Aguarde um instante e tente novamente.' },
});

const chunkLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 400,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas solicitações. Aguarde um instante e tente novamente.' },
});

const initSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(3).max(100),
  size: z.number().int().positive(),
});

function slugFrom(request: Request) {
  const value = request.params.slug;
  return Array.isArray(value) ? value[0] : value;
}

function publicError(response: Response, error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Não foi possível processar o envio.';
  const status = message.includes('não encontrada') ? 404 : 400;
  return response.status(status).json({ error: message });
}

router.get(
  '/galleries/:slug',
  publicLimiter,
  async (request: Request, response: Response) => {
    try {
      const gallery = await getPublicGalleryUploadInfo(slugFrom(request));
      response.json({ gallery });
    } catch (error) {
      publicError(response, error);
    }
  }
);

router.get(
  '/galleries/:slug/cover',
  publicLimiter,
  async (request: Request, response: Response) => {
    try {
      const gallery = await getPublishedGalleryBySlug(slugFrom(request));
      if (!gallery.coverPhoto) {
        return response
          .status(404)
          .json({ error: 'Esta galeria ainda não tem foto de capa.' });
      }
      const file = await openStoredFile(gallery.coverPhoto);
      response.setHeader('Content-Type', file.mimeType);
      response.setHeader('Cache-Control', 'public, max-age=300');
      file.stream.pipe(response);
    } catch (error) {
      publicError(response, error);
    }
  }
);

router.post(
  '/galleries/:slug/upload/init',
  publicLimiter,
  async (request: Request, response: Response) => {
    const parsed = initSchema.safeParse(request.body);
    if (!parsed.success) {
      return response
        .status(400)
        .json({ error: formatZodError(parsed.error) });
    }
    try {
      const session = await initPublicPhotoUpload(
        slugFrom(request),
        parsed.data
      );
      response.json(session);
    } catch (error) {
      publicError(response, error);
    }
  }
);

router.post(
  '/galleries/:slug/upload/chunk',
  chunkLimiter,
  chunkUpload.single('chunk'),
  async (request: Request, response: Response) => {
    const sessionToken =
      typeof request.body.sessionToken === 'string'
        ? request.body.sessionToken
        : '';
    if (!sessionToken || !request.file) {
      return response.status(400).json({ error: 'Envio incompleto.' });
    }
    try {
      const result = await uploadPhotoChunk({
        sessionToken,
        buffer: request.file.buffer,
      });
      response.json(result);
    } catch (error) {
      publicError(response, error);
    }
  }
);

export default router;
