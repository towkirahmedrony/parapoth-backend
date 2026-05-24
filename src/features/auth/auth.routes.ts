import { Router } from 'express';
import { authController } from './auth.controller';
import { requireAuth } from '../../middlewares/requireAuth';

const router = Router();

// Public Routes
router.post('/admin/login', authController.adminLoginInit);
router.post('/admin/verify-2fa', authController.verify2FA); // Moved to public for login flow
router.post('/save-device', authController.saveDeviceInfo);

// Protected Routes
router.use(requireAuth);
router.get('/profile', authController.getProfile);
router.get('/permissions', authController.getRoleAndPermissions);
router.post('/2fa/setup', authController.setup2FA); 

export default router;
