import { Router } from 'express';
import { getUser360, getUsersList, forceLogoutDevice, adjustBalance } from './users.admin.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';

const router = Router();

router.use(requireAuth);
router.use(rbacGuard(['admin', 'moderator']));

router.get('/', getUsersList);
router.get('/:userId/360', getUser360);
router.post('/devices/:deviceId/force-logout', forceLogoutDevice);
router.post('/:userId/adjust-balance', adjustBalance);

export default router;
