import { Router } from 'express';
import { getDashboardStats } from './dashboard.admin.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';

const router = Router();

router.use(requireAuth, rbacGuard(['admin', 'super_admin']));
router.get('/stats', getDashboardStats);

export default router;
