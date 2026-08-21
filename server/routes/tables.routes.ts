import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import {
  assignGuestToTable,
  createTable,
  deleteTable,
  generateTables,
  listTables,
  updateTable,
} from '../services/table.service.js';
import { formatZodError } from '../utils/validation.js';

const router = Router({ mergeParams: true });

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas alterações. Aguarde um instante.' },
});

const generateSchema = z.object({
  count: z.number().int().min(1).max(80),
  seatsPerTable: z.number().int().min(1).max(40),
});

const tableSchema = z.object({
  name: z.string().trim().max(80).optional(),
  seats: z.number().int().min(1).max(40),
  notes: z.string().trim().max(400).optional(),
});

const assignSchema = z.object({
  guestId: z.string().min(1),
});

function galleryIdFrom(request: Request) {
  const value = request.params.galleryId;
  return Array.isArray(value) ? value[0] : value;
}

function tableIdFrom(request: Request) {
  const value = request.params.tableId;
  return Array.isArray(value) ? value[0] : value;
}

function guestIdFrom(request: Request) {
  const value = request.params.guestId;
  return Array.isArray(value) ? value[0] : value;
}

function tableError(response: Response, error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Não foi possível processar.';
  const status = message.includes('não encontrad')
    ? 404
    : message.includes('cheia') ||
        message.includes('suficientes') ||
        message.includes('ocupados')
      ? 409
      : 400;
  return response.status(status).json({ error: message });
}

router.get(
  '/',
  authenticate,
  async (request: Request, response: Response) => {
    try {
      const result = await listTables(
        request.user!._id.toString(),
        galleryIdFrom(request)
      );
      response.json(result);
    } catch (error) {
      tableError(response, error);
    }
  }
);

router.post(
  '/generate',
  authenticate,
  requireActiveSubscription,
  writeLimiter,
  async (request: Request, response: Response) => {
    const parsed = generateSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({ error: formatZodError(parsed.error) });
    }
    try {
      const result = await generateTables(
        request.user!._id.toString(),
        galleryIdFrom(request),
        parsed.data
      );
      response.json({ ...result, message: 'Mesas atualizadas.' });
    } catch (error) {
      tableError(response, error);
    }
  }
);

router.post(
  '/',
  authenticate,
  requireActiveSubscription,
  writeLimiter,
  async (request: Request, response: Response) => {
    const parsed = tableSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({ error: formatZodError(parsed.error) });
    }
    try {
      const table = await createTable(
        request.user!._id.toString(),
        galleryIdFrom(request),
        parsed.data
      );
      response.status(201).json({ table, message: 'Mesa criada.' });
    } catch (error) {
      tableError(response, error);
    }
  }
);

router.patch(
  '/:tableId',
  authenticate,
  requireActiveSubscription,
  writeLimiter,
  async (request: Request, response: Response) => {
    const parsed = tableSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({ error: formatZodError(parsed.error) });
    }
    try {
      const table = await updateTable(
        request.user!._id.toString(),
        galleryIdFrom(request),
        tableIdFrom(request),
        parsed.data
      );
      response.json({ table, message: 'Mesa atualizada.' });
    } catch (error) {
      tableError(response, error);
    }
  }
);

router.post(
  '/:tableId/guests',
  authenticate,
  requireActiveSubscription,
  writeLimiter,
  async (request: Request, response: Response) => {
    const parsed = assignSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({ error: formatZodError(parsed.error) });
    }
    try {
      const result = await assignGuestToTable(
        request.user!._id.toString(),
        galleryIdFrom(request),
        tableIdFrom(request),
        parsed.data.guestId
      );
      response.json(result);
    } catch (error) {
      tableError(response, error);
    }
  }
);

router.delete(
  '/:tableId/guests/:guestId',
  authenticate,
  requireActiveSubscription,
  writeLimiter,
  async (request: Request, response: Response) => {
    try {
      const result = await assignGuestToTable(
        request.user!._id.toString(),
        galleryIdFrom(request),
        null,
        guestIdFrom(request)
      );
      response.json(result);
    } catch (error) {
      tableError(response, error);
    }
  }
);

router.delete(
  '/:tableId',
  authenticate,
  requireActiveSubscription,
  writeLimiter,
  async (request: Request, response: Response) => {
    try {
      const result = await deleteTable(
        request.user!._id.toString(),
        galleryIdFrom(request),
        tableIdFrom(request)
      );
      response.json(result);
    } catch (error) {
      tableError(response, error);
    }
  }
);

export default router;
