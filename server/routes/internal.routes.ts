import { Router, type Request, type Response } from 'express';
import { requireCronSecret } from '../middleware/requireCronSecret.js';
import { runScheduledCleanup } from '../services/media-cleanup.service.js';
import { opsLog } from '../utils/ops-log.js';

const router = Router();

router.use(requireCronSecret);

async function runCleanup(_request: Request, response: Response) {
  try {
    const result = await runScheduledCleanup({ limit: 20 });
    opsLog('cron_cleanup', {
      expiredSubscriptions: result.expiredSubscriptions,
      purgedUsers: result.purgedUsers,
      deletedPhotos: result.deletedPhotos,
      tmpPartsDeleted: result.tmpPartsDeleted,
      photoCount: result.storage.photoCount,
      totalBytes: result.storage.totalBytes,
      incompleteUsers: result.incompleteUsers,
    });
    response.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    opsLog(
      'cron_cleanup_failed',
      { message: error instanceof Error ? error.message : 'cron_error' },
      'error'
    );
    response.status(500).json({
      error: 'Não foi possível concluir a limpeza agendada.',
    });
  }
}

router.get('/cleanup', runCleanup);
router.post('/cleanup', runCleanup);

export default router;
