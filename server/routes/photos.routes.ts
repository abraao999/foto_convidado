import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { platformConfig } from '../config/platform.js';
import { authenticate } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { openStoredFile } from '../services/storage-read.service.js';
import {
  createHeicPreview,
  isHeicPhoto,
  streamToBuffer,
} from '../utils/image-preview.js';
import {
  buildOwnedGalleryZip,
  getOwnedPhoto,
  getUserPhotoStats,
  initPhotoUpload,
  listGalleryPhotoIds,
  listGalleryPhotos,
  PHOTO_LIST_PAGE_SIZE,
  photoListPaging,
  uploadPhotoChunk,
} from '../services/photo.service.js';
import { chunkUpload } from '../utils/upload.js';
import { formatZodError } from '../utils/validation.js';

const router = Router();

const uploadLimiter = rateLimit({
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

const zipLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitos downloads. Aguarde um instante e tente novamente.' },
});

const initSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(3).max(100),
  size: z.number().int().positive(),
});

const zipSchema = z.object({
  photoIds: z.preprocess((value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return [value];
    return value;
  }, z.array(z.string().trim().min(1).max(64)).min(1).max(platformConfig.zipMaxPhotos)),
});

function param(request: Request, name: string) {
  const value = request.params[name];
  return Array.isArray(value) ? value[0] : value;
}

function photoError(response: Response, error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Não foi possível processar as fotos.';
  const status = message.includes('não encontrada')
    ? 404
    : message.includes('demorou demais')
      ? 504
      : message.includes('grande demais') || message.includes('no máximo')
        ? 413
        : 400;
  return response.status(status).json({ error: message });
}

router.get(
  '/stats',
  authenticate,
  async (request: Request, response: Response) => {
    const stats = await getUserPhotoStats(request.user!._id.toString());
    response.json(stats);
  }
);

router.get(
  '/gallery/:galleryId',
  authenticate,
  async (request: Request, response: Response) => {
    try {
      const page = Number(request.query.page);
      const limit = Number(request.query.limit);
      const result = await listGalleryPhotos(
        request.user!._id.toString(),
        param(request, 'galleryId'),
        photoListPaging(
          Number.isFinite(page) ? page : 1,
          Number.isFinite(limit) ? limit : PHOTO_LIST_PAGE_SIZE
        )
      );
      response.json(result);
    } catch (error) {
      photoError(response, error);
    }
  }
);

router.get(
  '/gallery/:galleryId/ids',
  authenticate,
  async (request: Request, response: Response) => {
    try {
      const result = await listGalleryPhotoIds(
        request.user!._id.toString(),
        param(request, 'galleryId')
      );
      response.json(result);
    } catch (error) {
      photoError(response, error);
    }
  }
);

async function createGalleryZip(request: Request, photoIds: string[]) {
  return buildOwnedGalleryZip({
    userId: request.user!._id.toString(),
    galleryId: param(request, 'galleryId'),
    photoIds,
  });
}

router.get(
  '/gallery/:galleryId/zip',
  authenticate,
  zipLimiter,
  async (request: Request, response: Response) => {
    const idsParam = request.query.ids;
    const rawIds =
      typeof idsParam === 'string'
        ? idsParam.split(',')
        : Array.isArray(idsParam)
          ? idsParam.flatMap((value) => String(value).split(','))
          : [];
    const parsed = zipSchema.safeParse({ photoIds: rawIds });
    if (!parsed.success) {
      return response
        .status(400)
        .json({ error: formatZodError(parsed.error) });
    }

    try {
      const zip = await createGalleryZip(request, parsed.data.photoIds);
      response.redirect(302, zip.downloadUrl);
    } catch (error) {
      photoError(response, error);
    }
  }
);

router.post(
  '/gallery/:galleryId/zip',
  authenticate,
  zipLimiter,
  async (request: Request, response: Response) => {
    const parsed = zipSchema.safeParse(request.body);
    if (!parsed.success) {
      return response
        .status(400)
        .json({ error: formatZodError(parsed.error) });
    }

    try {
      const zip = await createGalleryZip(request, parsed.data.photoIds);
      response.json(zip);
    } catch (error) {
      photoError(response, error);
    }
  }
);

router.post(
  '/gallery/:galleryId/init',
  authenticate,
  requireActiveSubscription,
  uploadLimiter,
  async (request: Request, response: Response) => {
    const parsed = initSchema.safeParse(request.body);
    if (!parsed.success) {
      return response
        .status(400)
        .json({ error: formatZodError(parsed.error) });
    }
    try {
      const session = await initPhotoUpload({
        ownerUserId: request.user!._id.toString(),
        galleryId: param(request, 'galleryId'),
        ...parsed.data,
      });
      response.json(session);
    } catch (error) {
      photoError(response, error);
    }
  }
);

router.post(
  '/upload/chunk',
  authenticate,
  requireActiveSubscription,
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
        expectedUserId: request.user!._id.toString(),
      });
      response.json(result);
    } catch (error) {
      photoError(response, error);
    }
  }
);

router.get(
  '/:photoId/content',
  authenticate,
  async (request: Request, response: Response) => {
    const photo = await getOwnedPhoto(
      request.user!._id.toString(),
      param(request, 'photoId')
    );
    if (!photo) {
      return response.status(404).json({ error: 'Foto não encontrada.' });
    }

    try {
      const storageRef = photo.storageKey;
      if (!storageRef) {
        return response.status(404).json({ error: 'Foto não encontrada no armazenamento.' });
      }

      const file = await openStoredFile(storageRef);
      const download = request.query.download === '1';
      const asciiName = photo.fileName
        .replace(/[^\x20-\x7e]/g, '_')
        .replace(/"/g, '');

      response.setHeader('Cache-Control', 'private, max-age=3600');
      response.setHeader('X-Content-Type-Options', 'nosniff');

      if (download) {
        response.setHeader('Content-Type', photo.mimeType);
        response.setHeader(
          'Content-Disposition',
          `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(photo.fileName)}`
        );
        file.stream.on('error', () => response.destroy());
        file.stream.pipe(response);
        return;
      }

      if (isHeicPhoto(photo.mimeType, photo.fileName)) {
        const buffer = await streamToBuffer(file.stream);
        const preview = await createHeicPreview(buffer);
        response.setHeader('Content-Type', 'image/jpeg');
        response.send(preview);
        return;
      }

      response.setHeader('Content-Type', photo.mimeType || file.mimeType);
      file.stream.on('error', () => response.destroy());
      file.stream.pipe(response);
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'Code' in error
          ? String((error as { Code?: string }).Code)
          : '';
      if (code === 'NoSuchKey' || code === 'NotFound') {
        return response.status(404).json({ error: 'Arquivo da foto não encontrado no armazenamento.' });
      }
      console.error('Falha ao carregar foto:', error);
      response.status(502).json({ error: 'Não foi possível carregar a foto.' });
    }
  }
);

export default router;
