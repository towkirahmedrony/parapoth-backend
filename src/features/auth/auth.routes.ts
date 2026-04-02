import { Router } from 'express';
import { authController } from './auth.controller';
import { requireAuth } from '../../middlewares/requireAuth'; // কার্লি ব্র্যাকেট দিয়ে Named Import

const router = Router();

// এখন এটি নিশ্চিতভাবে একটি ফাংশন হিসেবে পাস হবে
router.use(requireAuth);

router.get('/profile', authController.getProfile);
router.get('/permissions', authController.getRoleAndPermissions);

export default router;
