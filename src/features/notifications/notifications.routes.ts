import { Router } from 'express';
import * as NotificationUserController from './notifications.user.controller';
import { requireAuth } from '../../middlewares/requireAuth';

const router = Router();

router.use(requireAuth);

router.get('/', NotificationUserController.getUserNotifications);
router.post('/read', NotificationUserController.markAsRead);

// Device token update route (আপনার ফ্রন্টএন্ড থেকে এই রাউটে রিকোয়েস্ট আসছে)
router.post('/device-token', (req, res) => {
    // আপাতত Dummy Response, পরে Firebase Token সেভ করার লজিক এখানে আসবে
    res.status(200).json({ success: true, message: 'Device token received' });
});

export default router;
