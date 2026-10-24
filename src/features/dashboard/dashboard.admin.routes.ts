import { Router } from 'express';
import { getDashboardStats } from './dashboard.admin.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';
import { requirePermission } from '../../middlewares/requirePermission';
import { PERMISSIONS } from '../../middlewares/authorization';

const router = Router();

// Apply authentication and ensure only users with 'admin' or 'super_admin' roles can access
router.use(requireAuth, rbacGuard(['admin', 'super_admin']), requirePermission(PERMISSIONS.ANALYTICS_READ));

router.get('/stats', getDashboardStats);

export default router;
