import { Router } from 'express';
import * as NotificationUserController from './notifications.user.controller';
import { updateDeviceToken } from './notifications.controller';
import { requireAuth } from '../../middlewares/requireAuth';

const router = Router();

router.use(requireAuth);

router.get('/', NotificationUserController.getUserNotifications);
router.post('/read', NotificationUserController.markAsRead);

// Device token update route
router.post('/device-token', updateDeviceToken);

export default router;
