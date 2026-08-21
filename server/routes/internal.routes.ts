import { Router, type Request, type Response } from 'express';
import { requireCronSecret } from '../middleware/requireCronSecret.js';
import { runScheduledCleanup } from '../services/media-cleanup.service.js';

const router = Router();

router.use(requireCronSecret);

async function runCleanup(_request: Request, response: Response) {
  try {
    const result = await runScheduledCleanup({ limit: 20 });
    console.info('[cron] limpeza agendada', result);
    response.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error('Falha na limpeza agendada:', error);
    response.status(500).json({
      error: 'Não foi possível concluir a limpeza agendada.',
    });
  }
}

router.get('/cleanup', runCleanup);
router.post('/cleanup', runCleanup);

export default router;
