import { Router } from 'express';
import * as communityAdminController from './community.admin.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import rbacGuard from '../../middlewares/rbacGuard';

const router = Router();

// Apply guards to all community routes
router.use(requireAuth);
router.use(rbacGuard(['admin', 'moderator'])); // Only admins and moderators can access

// Dashboard & Metrics
router.get('/overview', communityAdminController.getOverview);

// Moderation Queue
router.get('/flagged-chats', communityAdminController.getFlaggedChats);
router.post('/moderate', communityAdminController.moderateAction);

// Auto-Ban Dictionary Settings
router.get('/auto-ban-dict', communityAdminController.getAutoBanDict);
router.put('/auto-ban-dict', communityAdminController.updateAutoBanDict);

// Live Chat Monitor (New Routes)
router.get('/live-chats', communityAdminController.getLiveChats);
router.delete('/live-chats/:messageId', communityAdminController.deleteLiveChatMessage);

export default router;
