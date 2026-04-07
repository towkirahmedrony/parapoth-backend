import { Router } from 'express';
import * as NotificationAdminController from './notifications.admin.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';

const router = Router();
router.use(requireAuth, rbacGuard(['admin'])); 

// Campaigns
router.post('/campaigns', NotificationAdminController.createCampaign);
router.get('/campaigns', NotificationAdminController.getCampaigns);
router.put('/campaigns/:id', NotificationAdminController.updateCampaign); // NEW: Edit
router.patch('/campaigns/:id/cancel', NotificationAdminController.cancelCampaign);
router.delete('/campaigns/:id', NotificationAdminController.deleteCampaign); // NEW: Delete

// Notices
router.post('/notices', NotificationAdminController.createNotice);
router.get('/notices', NotificationAdminController.getNotices);
router.put('/notices/:id', NotificationAdminController.updateNotice); // NEW: Edit
router.delete('/notices/:id', NotificationAdminController.deleteNotice); // DELETE

export default router;
