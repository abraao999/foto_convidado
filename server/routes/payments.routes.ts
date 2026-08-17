import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import {
  createCheckout,
  listUserPayments,
  processMercadoPagoPayment,
  serializePayment,
} from '../services/payment.service.js';
import { validateMercadoPagoWebhook } from '../services/mercadopago.service.js';

const router = Router();

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Muitas tentativas de pagamento. Aguarde alguns minutos.',
  },
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post(
  '/checkout',
  authenticate,
  checkoutLimiter,
  async (request: Request, response: Response) => {
    try {
      const result = await createCheckout(request.user!);
      response.status(201).json({
        payment: serializePayment(result.payment),
        checkoutUrl: result.checkoutUrl,
      });
    } catch (error) {
      console.error('Falha ao criar checkout:', error);
      response.status(500).json({
        error:
          error instanceof Error &&
          error.message.includes('não está configurada')
            ? 'O pagamento ainda não está configurado.'
            : 'Não foi possível iniciar o pagamento.',
      });
    }
  }
);

router.get(
  '/me',
  authenticate,
  async (request: Request, response: Response) => {
    try {
      const payments = await listUserPayments(
        request.user!._id.toString()
      );
      response.json({ payments: payments.map(serializePayment) });
    } catch (error) {
      console.error('Falha ao listar pagamentos:', error);
      response
        .status(500)
        .json({ error: 'Não foi possível carregar os pagamentos.' });
    }
  }
);

router.post(
  '/webhook',
  webhookLimiter,
  async (request: Request, response: Response) => {
    const queryDataId = request.query['data.id'];
    const dataId =
      typeof queryDataId === 'string'
        ? queryDataId
        : undefined;

    if (!dataId) {
      return response.status(400).json({ error: 'ID ausente.' });
    }

    try {
      validateMercadoPagoWebhook({
        xSignature: request.headers['x-signature'],
        xRequestId: request.headers['x-request-id'],
        dataId,
      });
    } catch (error) {
      console.warn('Webhook do Mercado Pago rejeitado:', {
        requestId: request.headers['x-request-id'],
        reason: error instanceof Error ? error.name : 'invalid_signature',
      });
      return response.status(401).json({ error: 'Assinatura inválida.' });
    }

    const eventType =
      typeof request.body?.type === 'string' ? request.body.type : '';
    const action =
      typeof request.body?.action === 'string' ? request.body.action : '';

    if (eventType !== 'payment' && !action.startsWith('payment.')) {
      return response.status(200).json({ ok: true, ignored: true });
    }

    try {
      const payment = await processMercadoPagoPayment(dataId);
      response.status(200).json({
        ok: true,
        paymentId: payment?._id.toString(),
      });
    } catch (error) {
      console.error('Falha ao processar webhook do Mercado Pago:', {
        externalPaymentId: dataId,
        error,
      });
      // O 500 solicita que o Mercado Pago tente a notificação novamente.
      response
        .status(500)
        .json({ error: 'Não foi possível processar a notificação.' });
    }
  }
);

export default router;
