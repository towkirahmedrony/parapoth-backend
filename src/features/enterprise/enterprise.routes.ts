import { Router } from 'express';
import * as enterpriseController from './enterprise.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';

const router = Router();

// Apply auth and admin-only role guard to all enterprise routes
router.use(requireAuth, rbacGuard(['admin']));

// Staff & RBAC Management
router.get('/staff', enterpriseController.getStaffList);
router.post('/staff/assign', enterpriseController.assignStaffRole);
router.delete('/staff/:id', enterpriseController.removeStaffAccess);
router.get('/permissions', enterpriseController.getPermissions);
router.post('/permissions/toggle', enterpriseController.togglePermission);

// Active Sessions & Security Audit
router.get('/sessions', enterpriseController.getActiveSessions);
router.delete('/sessions/:id', enterpriseController.revokeSession);
router.get('/audit-logs', enterpriseController.getSecurityAuditLogs);

// Feature Flags
router.get('/feature-flags', enterpriseController.getFeatureFlags);
router.put('/feature-flags/:key', enterpriseController.toggleFeatureFlag);

// Async Reports
router.get('/reports', enterpriseController.getReports);
router.post('/reports/request', enterpriseController.requestReport);

export default router;
