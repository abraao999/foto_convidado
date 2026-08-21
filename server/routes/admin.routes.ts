import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  adminExpireAccess,
  adminGrantAccess,
  getAdminOverview,
  listAdminGalleries,
  listAdminPayments,
  listAdminUsers,
  setUserStatus,
} from '../services/admin.service.js';
import { getAccessOffer } from '../services/subscription.service.js';
import { formatZodError } from '../utils/validation.js';

const router = Router();

router.use(authenticate, requireRole('ADMIN'));

function adminError(response: Response, error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Não foi possível processar.';
  const status = message.includes('não encontrado')
    ? 404
    : message.includes('permissão') || message.includes('restrito')
      ? 403
      : 400;
  return response.status(status).json({ error: message });
}

function param(request: Request, name: string) {
  const value = request.params[name];
  return Array.isArray(value) ? value[0] : value;
}

const statusSchema = z.object({
  status: z.enum(['ACTIVE', 'BLOCKED']),
});

router.get('/overview', async (_request: Request, response: Response) => {
  try {
    const overview = await getAdminOverview();
    response.json(overview);
  } catch (error) {
    console.error('Admin overview:', error);
    response.status(500).json({ error: 'Não foi possível carregar o resumo.' });
  }
});

router.get('/users', async (_request: Request, response: Response) => {
  try {
    const users = await listAdminUsers();
    response.json({ users });
  } catch (error) {
    console.error('Admin users:', error);
    response.status(500).json({ error: 'Não foi possível listar usuários.' });
  }
});

router.patch(
  '/users/:userId/status',
  async (request: Request, response: Response) => {
    const parsed = statusSchema.safeParse(request.body);
    if (!parsed.success) {
      return response
        .status(400)
        .json({ error: formatZodError(parsed.error) });
    }
    try {
      const user = await setUserStatus({
        adminId: request.user!._id.toString(),
        userId: param(request, 'userId'),
        status: parsed.data.status,
      });
      response.json({
        user,
        message:
          parsed.data.status === 'BLOCKED'
            ? 'Usuário bloqueado.'
            : 'Usuário reativado.',
      });
    } catch (error) {
      adminError(response, error);
    }
  }
);

router.post(
  '/users/:userId/grant-access',
  async (request: Request, response: Response) => {
    try {
      const result = await adminGrantAccess(param(request, 'userId'));
      response.status(201).json({
        ...result,
        message: `Acesso de ${getAccessOffer().durationDays} dias concedido.`,
      });
    } catch (error) {
      adminError(response, error);
    }
  }
);

router.post(
  '/users/:userId/expire-access',
  async (request: Request, response: Response) => {
    try {
      const result = await adminExpireAccess(param(request, 'userId'));
      response.json({
        ...result,
        message:
          result.expiredCount > 0
            ? 'Acesso expirado com sucesso.'
            : 'Este usuário não tinha acesso ativo.',
      });
    } catch (error) {
      adminError(response, error);
    }
  }
);

router.get('/payments', async (_request: Request, response: Response) => {
  try {
    const payments = await listAdminPayments();
    response.json({ payments });
  } catch (error) {
    console.error('Admin payments:', error);
    response.status(500).json({ error: 'Não foi possível listar pagamentos.' });
  }
});

router.get('/galleries', async (_request: Request, response: Response) => {
  try {
    const galleries = await listAdminGalleries();
    response.json({ galleries });
  } catch (error) {
    console.error('Admin galleries:', error);
    response.status(500).json({ error: 'Não foi possível listar galerias.' });
  }
});

export default router;
