import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  ADMIN_LIST_PAGE_SIZE,
  adminExpireAccess,
  adminGrantAccess,
  adminListPaging,
  createAdminUser,
  getAdminOverview,
  listAdminGalleries,
  listAdminPayments,
  listAdminUsers,
  setUserStatus,
} from '../services/admin.service.js';
import { runScheduledCleanup } from '../services/media-cleanup.service.js';
import { getAccessOffer } from '../services/subscription.service.js';
import { formatZodError, registerSchema } from '../utils/validation.js';

const router = Router();

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas solicitações no painel admin. Aguarde um instante.' },
});

router.use(authenticate, requireRole('ADMIN'), adminLimiter);

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

function pagingFromQuery(request: Request) {
  const page = Number(request.query.page);
  const limit = Number(request.query.limit);
  return adminListPaging(
    Number.isFinite(page) ? page : 1,
    Number.isFinite(limit) ? limit : ADMIN_LIST_PAGE_SIZE
  );
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

router.get('/users', async (request: Request, response: Response) => {
  try {
    const result = await listAdminUsers(pagingFromQuery(request));
    response.json(result);
  } catch (error) {
    console.error('Admin users:', error);
    response.status(500).json({ error: 'Não foi possível listar usuários.' });
  }
});

router.post('/users', async (request: Request, response: Response) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) {
    return response
      .status(400)
      .json({ error: formatZodError(parsed.error) });
  }

  try {
    const user = await createAdminUser(parsed.data);
    response.status(201).json({
      user,
      message: 'Administrador criado com sucesso.',
    });
  } catch (error) {
    adminError(response, error);
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
        message: `Acesso de ${getAccessOffer().durationDays} dias liberado sem pagamento.`,
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

router.get('/payments', async (request: Request, response: Response) => {
  try {
    const result = await listAdminPayments(pagingFromQuery(request));
    response.json(result);
  } catch (error) {
    console.error('Admin payments:', error);
    response.status(500).json({ error: 'Não foi possível listar pagamentos.' });
  }
});

router.get('/galleries', async (request: Request, response: Response) => {
  try {
    const result = await listAdminGalleries(pagingFromQuery(request));
    response.json(result);
  } catch (error) {
    console.error('Admin galleries:', error);
    response.status(500).json({ error: 'Não foi possível listar galerias.' });
  }
});

router.post('/purge-expired-media', async (_request: Request, response: Response) => {
  try {
    const result = await runScheduledCleanup({ limit: 20 });
    response.json({
      ...result,
      message:
        result.purgedUsers > 0
          ? `Limpeza concluída: ${result.purgedUsers} conta(s) processada(s).`
          : 'Nenhuma conta pendente de limpeza.',
    });
  } catch (error) {
    console.error('Admin purge media:', error);
    response.status(500).json({ error: 'Não foi possível limpar a mídia expirada.' });
  }
});

export default router;
