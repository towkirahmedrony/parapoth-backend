import { Router } from 'express';
import { getUser360, getUsersList } from './users.admin.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';

const router = Router();

router.use(requireAuth);
router.use(rbacGuard(['admin', 'moderator']));

// নতুন: GET /api/v1/admin/users রাউটটি যোগ করা হলো
router.get('/', getUsersList);

// আগের 360 প্রোফাইলের রাউট
router.get('/:userId/360', getUser360);

export default router;
