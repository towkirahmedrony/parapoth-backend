import { Router } from 'express';
import { syncVectorIndex, chatWithAI, getAiConfig, updateAiConfig } from './ai.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';

const router = Router();

// Config routes (Admin only)
router.get('/config', requireAuth, rbacGuard(['admin']), getAiConfig);
router.post('/config', requireAuth, rbacGuard(['admin']), updateAiConfig);

// Vector Sync (Admin only)
router.post('/sync-embeddings', requireAuth, rbacGuard(['admin']), syncVectorIndex);

// Chat (Any logged in user)
router.post('/chat', requireAuth, chatWithAI);

export default router;
