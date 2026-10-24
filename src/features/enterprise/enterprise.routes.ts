import { Router } from 'express';
import * as enterpriseController from './enterprise.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import rbacGuard from '../../middlewares/rbacGuard';
import { PERMISSIONS } from '../../middlewares/authorization';
import { requirePermission } from '../../middlewares/requirePermission';

const router = Router();
router.use(
  requireAuth,
  rbacGuard(['admin', 'super_admin']),
  requirePermission(PERMISSIONS.ENTERPRISE_MANAGE),
);

router.get('/staff', enterpriseController.getStaffList);
router.post('/staff/assign', requirePermission(PERMISSIONS.ROLE_ASSIGN_STAFF), enterpriseController.assignStaffRole);
router.delete('/staff/:id', requirePermission(PERMISSIONS.ROLE_ASSIGN_STAFF), enterpriseController.removeStaffAccess);
router.get('/permissions', enterpriseController.getPermissions);
router.post('/permissions/toggle', rbacGuard(['super_admin']), enterpriseController.togglePermission);
router.get('/sessions', rbacGuard(['super_admin']), enterpriseController.getActiveSessions);
router.delete('/sessions/:id', rbacGuard(['super_admin']), enterpriseController.revokeSession);
router.get('/audit-logs', rbacGuard(['super_admin']), enterpriseController.getSecurityAuditLogs);
router.get('/feature-flags', requirePermission(PERMISSIONS.SETTINGS_MANAGE), enterpriseController.getFeatureFlags);
router.put('/feature-flags/:key', requirePermission(PERMISSIONS.SETTINGS_MANAGE), enterpriseController.toggleFeatureFlag);
router.get('/reports', requirePermission(PERMISSIONS.ANALYTICS_READ), enterpriseController.getReports);
router.post('/reports/request', enterpriseController.requestReport);

export default router;
