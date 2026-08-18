import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { serializeUser } from '../services/auth.service.js';
import {
  downloadProfileAvatar,
  uploadProfileAvatar,
} from '../services/google-drive.service.js';
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
    const fileId = request.user!.avatarDriveFileId;
    if (!fileId) {
      return response.status(404).json({ error: 'Foto de perfil não encontrada.' });
    }

    try {
      const avatar = await downloadProfileAvatar(fileId);
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
      const uploaded = await uploadProfileAvatar({
        userId: request.user!._id.toString(),
        buffer: request.file.buffer,
        mimeType: request.file.mimetype,
        originalName: request.file.originalname,
      });
      const user = await User.findByIdAndUpdate(
        request.user!._id,
        {
          $set: {
            avatarUrl: uploaded.url,
            avatarDriveFileId: uploaded.fileId,
          },
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
