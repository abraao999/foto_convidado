import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import {
  archiveGallery,
  createGallery,
  getOwnedGalleryCover,
  listUserGalleries,
  serializeGallery,
  setGalleryCover,
  setGalleryPublication,
  updateGallery,
} from '../services/gallery.service.js';
import { downloadProfileAvatar, uploadGalleryPhoto } from '../services/google-drive.service.js';
import { formatZodError } from '../utils/validation.js';

const router = Router();
const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 8 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    callback(null, allowed.includes(file.mimetype));
  },
});

const gallerySchema = z.object({
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

function galleryError(response: Response, error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : 'Não foi possível atualizar a galeria.';
  const status = message.includes('não encontrada')
    ? 404
    : message.includes('já está em uso')
      ? 409
      : 400;
  return response.status(status).json({ error: message });
}

function galleryIdFrom(request: Request) {
  const value = request.params.galleryId;
  return Array.isArray(value) ? value[0] : value;
}

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
    const parsed = gallerySchema.safeParse(request.body);
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

router.patch(
  '/:galleryId',
  authenticate,
  requireActiveSubscription,
  async (request: Request, response: Response) => {
    const parsed = gallerySchema.safeParse(request.body);
    if (!parsed.success) {
      return response
        .status(400)
        .json({ error: formatZodError(parsed.error) });
    }
    try {
      const gallery = await updateGallery(
        request.user!._id.toString(),
        galleryIdFrom(request),
        parsed.data
      );
      response.json({
        gallery: serializeGallery(gallery),
        message: 'Galeria atualizada com sucesso.',
      });
    } catch (error) {
      galleryError(response, error);
    }
  }
);

router.post(
  '/:galleryId/cover',
  authenticate,
  requireActiveSubscription,
  coverUpload.single('cover'),
  async (request: Request, response: Response) => {
    if (!request.file) {
      return response.status(400).json({
        error: 'Escolha uma imagem JPG, PNG ou WebP de até 8 MB.',
      });
    }
    try {
      const galleryId = galleryIdFrom(request);
      const uploaded = await uploadGalleryPhoto({
        userId: request.user!._id.toString(),
        galleryId,
        buffer: request.file.buffer,
        mimeType: request.file.mimetype,
        originalName: `cover-${request.file.originalname}`,
      });
      const gallery = await setGalleryCover(
        request.user!._id.toString(),
        galleryId,
        uploaded.fileId
      );
      response.json({
        gallery: serializeGallery(gallery),
        message: 'Foto de capa atualizada.',
      });
    } catch (error) {
      galleryError(response, error);
    }
  }
);

router.get(
  '/:galleryId/cover',
  authenticate,
  async (request: Request, response: Response) => {
    try {
      const fileId = await getOwnedGalleryCover(
        request.user!._id.toString(),
        galleryIdFrom(request)
      );
      const file = await downloadProfileAvatar(fileId);
      response.setHeader('Content-Type', file.mimeType);
      response.setHeader('Cache-Control', 'private, max-age=300');
      file.stream.pipe(response);
    } catch (error) {
      galleryError(response, error);
    }
  }
);

router.post(
  '/:galleryId/publish',
  authenticate,
  requireActiveSubscription,
  async (request: Request, response: Response) => {
    try {
      const gallery = await setGalleryPublication(
        request.user!._id.toString(),
        galleryIdFrom(request),
        true
      );
      response.json({
        gallery: serializeGallery(gallery),
        message: 'Galeria publicada.',
      });
    } catch (error) {
      galleryError(response, error);
    }
  }
);

router.post(
  '/:galleryId/unpublish',
  authenticate,
  requireActiveSubscription,
  async (request: Request, response: Response) => {
    try {
      const gallery = await setGalleryPublication(
        request.user!._id.toString(),
        galleryIdFrom(request),
        false
      );
      response.json({
        gallery: serializeGallery(gallery),
        message: 'Galeria retirada do público.',
      });
    } catch (error) {
      galleryError(response, error);
    }
  }
);

router.delete(
  '/:galleryId',
  authenticate,
  requireActiveSubscription,
  async (request: Request, response: Response) => {
    try {
      const gallery = await archiveGallery(
        request.user!._id.toString(),
        galleryIdFrom(request)
      );
      response.json({
        gallery: serializeGallery(gallery),
        message: 'Galeria arquivada. Nenhum dado foi excluído.',
      });
    } catch (error) {
      galleryError(response, error);
    }
  }
);

export default router;
