import { Router } from 'express';
import * as communityAdminController from './community.admin.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import rbacGuard from '../../middlewares/rbacGuard';
import { requirePermission } from '../../middlewares/requirePermission';
import { PERMISSIONS } from '../../middlewares/authorization';

const router = Router();
router.use(requireAuth);

const reviewGuard = [rbacGuard(['admin', 'moderator']), requirePermission(PERMISSIONS.MODERATION_REVIEW)];
const actionGuard = [rbacGuard(['admin', 'moderator']), requirePermission(PERMISSIONS.MODERATION_ACTION)];
const settingsGuard = [rbacGuard(['admin']), requirePermission(PERMISSIONS.SETTINGS_MANAGE)];

router.get('/overview', ...reviewGuard, communityAdminController.getOverview);
router.get('/flagged-chats', ...reviewGuard, communityAdminController.getFlaggedChats);
router.post('/moderate', ...actionGuard, communityAdminController.moderateAction);
router.get('/auto-ban-dict', ...settingsGuard, communityAdminController.getAutoBanDict);
router.put('/auto-ban-dict', ...settingsGuard, communityAdminController.updateAutoBanDict);
router.get('/live-chats', ...reviewGuard, communityAdminController.getLiveChats);
router.delete('/live-chats/:messageId', ...actionGuard, communityAdminController.deleteLiveChatMessage);

export default router;
