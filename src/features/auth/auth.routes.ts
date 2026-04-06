import { Router } from 'express';
import { authController } from './auth.controller';
import { requireAuth } from '../../middlewares/requireAuth';

const router = Router();

// Public Routes (or initial login steps)
router.post('/admin/login', authController.adminLoginInit);

// Protected Routes (Require Authentication via Supabase Token)
router.use(requireAuth);

// 👈 verify-2fa এখন protected route, তাই এটি নিজে থেকেই টোকেন ভেরিফাই করে req.user এ ডেটা দিয়ে দেবে
router.post('/admin/verify-2fa', authController.verify2FA); 

router.get('/profile', authController.getProfile);
router.get('/permissions', authController.getRoleAndPermissions);
router.post('/2fa/setup', authController.setup2FA); // Route to generate QR code

export default router;
