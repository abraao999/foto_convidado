import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import {
  getSubscriptionSummary,
  getAccessOffer,
  grantAccess,
  listUserSubscriptions,
  serializeSubscription,
} from '../services/subscription.service.js';

const router = Router();

router.get('/me', authenticate, async (request: Request, response: Response) => {
  try {
    const summary = await getSubscriptionSummary(request.user!);
    response.json(summary);
  } catch (error) {
    console.error('Erro ao buscar assinatura:', error);
    response.status(500).json({ error: 'Não foi possível carregar sua assinatura.' });
  }
});

router.get('/me/history', authenticate, async (request: Request, response: Response) => {
  try {
    const subscriptions = await listUserSubscriptions(request.user!._id.toString());
    response.json({
      subscriptions: subscriptions.map((sub) => serializeSubscription(sub)),
    });
  } catch (error) {
    console.error('Erro ao buscar histórico:', error);
    response.status(500).json({ error: 'Não foi possível carregar o histórico.' });
  }
});

/** Rota de teste protegida por assinatura — será usada por galerias/upload nas próximas etapas. */
router.get('/me/premium-check', authenticate, requireActiveSubscription, (_request, response) => {
  response.json({ ok: true, message: 'Assinatura ativa confirmada no backend.' });
});

const grantSchema = z.object({
  userId: z.string().min(1),
});

router.post('/grant', authenticate, requireRole('ADMIN'), async (request: Request, response: Response) => {
  const parsed = grantSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Dados inválidos.' });

  try {
    const subscription = await grantAccess(parsed.data.userId);
    response.status(201).json({
      subscription: serializeSubscription(subscription),
      message: `Acesso de ${getAccessOffer().durationDays} dias concedido com sucesso.`,
    });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Não foi possível conceder.' });
  }
});

export default router;
