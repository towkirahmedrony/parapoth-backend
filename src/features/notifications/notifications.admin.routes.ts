import { Router } from 'express';
import * as NotificationAdminController from './notifications.admin.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';

const router = Router();

router.use(requireAuth, rbacGuard(['admin'])); 

// Campaigns (notifications table)
router.post('/campaigns', NotificationAdminController.createCampaign);
router.get('/campaigns', NotificationAdminController.getCampaigns);
router.patch('/campaigns/:id/cancel', NotificationAdminController.cancelCampaign);

// Notices (notices table)
router.post('/notices', NotificationAdminController.createNotice);
router.get('/notices', NotificationAdminController.getNotices);
router.delete('/notices/:id', NotificationAdminController.deleteNotice);

export default router;
