import { Router, type Request, type Response } from 'express';
import { ZipArchive } from 'archiver';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { openStoredFile } from '../services/storage-read.service.js';
import {
  createHeicPreview,
  isHeicPhoto,
  streamToBuffer,
} from '../utils/image-preview.js';
import {
  getOwnedPhoto,
  getOwnedPhotosForZip,
  getUserPhotoStats,
  initPhotoUpload,
  listGalleryPhotos,
  serializePhoto,
  uniqueZipEntryNames,
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
  }, z.array(z.string().trim().min(1).max(64)).min(1).max(100)),
});

function param(request: Request, name: string) {
  const value = request.params[name];
  return Array.isArray(value) ? value[0] : value;
}

function photoError(response: Response, error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Não foi possível processar as fotos.';
  const status = message.includes('não encontrada') ? 404 : 400;
  return response.status(status).json({ error: message });
}

function zipFileName(title: string) {
  const slug = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'galeria'}-fotos.zip`;
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
      const photos = await listGalleryPhotos(
        request.user!._id.toString(),
        param(request, 'galleryId')
      );
      response.json({ photos: photos.map(serializePhoto) });
    } catch (error) {
      photoError(response, error);
    }
  }
);

async function streamGalleryZip(
  request: Request,
  response: Response,
  photoIds: string[]
) {
  const { gallery, photos } = await getOwnedPhotosForZip({
    userId: request.user!._id.toString(),
    galleryId: param(request, 'galleryId'),
    photoIds,
  });

  const entryNames = uniqueZipEntryNames(photos.map((photo) => photo.fileName));
  const archive = new ZipArchive({ zlib: { level: 5 } });
  const fileName = zipFileName(gallery.title);

  response.setHeader('Content-Type', 'application/zip');
  response.setHeader(
    'Content-Disposition',
    `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
  );
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');

  archive.on('error', (error: Error) => {
    console.error('Falha ao montar ZIP:', error);
    if (!response.headersSent) {
      response.status(502).json({ error: 'Não foi possível gerar o ZIP.' });
    } else {
      response.destroy(error);
    }
  });

  request.on('close', () => {
    if (!response.writableEnded) {
      archive.abort();
    }
  });

  archive.pipe(response);

  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index]!;
    if (!photo.storageKey) {
      throw new Error('Foto sem arquivo no armazenamento.');
    }
    const file = await openStoredFile(photo.storageKey);
    archive.append(file.stream, { name: entryNames[index]! });
  }

  await archive.finalize();
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
      await streamGalleryZip(request, response, parsed.data.photoIds);
    } catch (error) {
      if (response.headersSent) {
        console.error('Falha durante streaming do ZIP:', error);
        response.destroy();
        return;
      }
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
      await streamGalleryZip(request, response, parsed.data.photoIds);
    } catch (error) {
      if (response.headersSent) {
        console.error('Falha durante streaming do ZIP:', error);
        response.destroy();
        return;
      }
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
