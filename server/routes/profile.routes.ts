import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { serializeUser } from '../services/auth.service.js';
import {
  buildAvatarStorageKey,
  uploadFile,
} from '../services/r2.service.js';
import { openStoredFile } from '../services/storage-read.service.js';
import { updateProfile } from '../services/profile.service.js';
import { formatZodError } from '../utils/validation.js';

const router = Router();
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 5 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    callback(null, allowed.includes(file.mimetype));
  },
});

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome.').max(120),
  lastName: optionalText(120),
  phone: optionalText(30).refine(
    (value) => !value || /^[+()\d\s.-]{8,30}$/.test(value),
    'Telefone inválido.'
  ),
});

router.get(
  '/',
  authenticate,
  (request: Request, response: Response) => {
    response.json({ user: serializeUser(request.user!) });
  }
);

router.get(
  '/avatar',
  authenticate,
  async (request: Request, response: Response) => {
    const storageRef = request.user!.avatarStorageKey;
    if (!storageRef) {
      return response.status(404).json({ error: 'Foto de perfil não encontrada.' });
    }

    try {
      const avatar = await openStoredFile(storageRef);
      response.setHeader('Content-Type', avatar.mimeType);
      response.setHeader('Cache-Control', 'private, max-age=300');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      avatar.stream.on('error', () => {
        if (!response.headersSent) {
          response.status(502).end();
        } else {
          response.destroy();
        }
      });
      avatar.stream.pipe(response);
    } catch (error) {
      console.error('Falha ao carregar avatar:', error);
      response.status(502).json({
        error: 'Não foi possível carregar a foto de perfil.',
      });
    }
  }
);

router.post(
  '/avatar',
  authenticate,
  avatarUpload.single('avatar'),
  async (request: Request, response: Response) => {
    if (!request.file) {
      return response.status(400).json({
        error: 'Escolha uma imagem JPG, PNG ou WebP de até 5 MB.',
      });
    }

    try {
      const storageKey = buildAvatarStorageKey(
        request.user!._id.toString(),
        request.file.originalname,
        request.file.mimetype
      );
      await uploadFile({
        storageKey,
        buffer: request.file.buffer,
        mimeType: request.file.mimetype,
      });
      const user = await User.findByIdAndUpdate(
        request.user!._id,
        {
          $set: {
            avatarStorageKey: storageKey,
            avatarUrl: `/api/profile/avatar`,
          },
          $unset: { avatarDriveFileId: 1 },
        },
        { new: true, runValidators: true }
      );
      if (!user) {
        return response.status(404).json({ error: 'Usuário não encontrado.' });
      }
      response.json({
        user: serializeUser(user),
        message: 'Foto de perfil atualizada.',
      });
    } catch (error) {
      console.error('Falha no upload do avatar:', error);
      response.status(500).json({
        error: 'Não foi possível enviar a foto agora. Tente novamente.',
      });
    }
  }
);

router.put(
  '/',
  authenticate,
  async (request: Request, response: Response) => {
    const parsed = profileSchema.safeParse(request.body);
    if (!parsed.success) {
      return response
        .status(400)
        .json({ error: formatZodError(parsed.error) });
    }

    try {
      const user = await updateProfile(
        request.user!._id.toString(),
        parsed.data
      );
      response.json({
        user: serializeUser(user),
        message: 'Perfil atualizado com sucesso.',
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar o perfil.';
      response.status(message.includes('já está em uso') ? 409 : 400).json({
        error: message,
      });
    }
  }
);

export default router;
