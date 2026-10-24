import { Router } from 'express';
import * as accessController from './access.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';
import { requirePermission } from '../../middlewares/requirePermission';
import { PERMISSIONS } from '../../middlewares/authorization';

const userAccessRouter = Router();
userAccessRouter.get('/', requireAuth, accessController.getMyAccess);

const adminAccessRouter = Router();
adminAccessRouter.use(requireAuth);
adminAccessRouter.use(rbacGuard(['admin']), requirePermission(PERMISSIONS.QUOTAS_MANAGE));

adminAccessRouter.get('/quotas', accessController.getQuotas);
adminAccessRouter.patch('/quotas/:feature', accessController.updateQuota);
adminAccessRouter.get('/grants', accessController.getGrants);
adminAccessRouter.post('/grants', accessController.createGrant);
adminAccessRouter.patch('/grants/:id/revoke', accessController.revokeGrant);
adminAccessRouter.get('/users/search', accessController.searchUsers);
adminAccessRouter.get('/users/:id/access', accessController.getUserAccess);
adminAccessRouter.post('/users/:id/usage/reset', accessController.resetUserUsage);
adminAccessRouter.get('/overview', accessController.getOverview);

export const accessRoutes = {
  userAccess: userAccessRouter,
  adminAccess: adminAccessRouter
};
