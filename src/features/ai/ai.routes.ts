import { Router } from 'express';
import {
  chatWithAI,
  getAiConfig,
  syncVectorIndex,
  updateAiConfig,
} from './ai.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';

const router = Router();

router.get('/config', requireAuth, rbacGuard(['admin']), getAiConfig);
router.post('/config', requireAuth, rbacGuard(['admin']), updateAiConfig);

router.post('/sync-embeddings', requireAuth, rbacGuard(['admin']), syncVectorIndex);

router.post('/chat', requireAuth, chatWithAI);

export default router;
