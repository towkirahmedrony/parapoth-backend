import { Router } from 'express';
import * as AdminProfileController from './profile.admin.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';

const router = Router();

router.use(requireAuth);
router.use(rbacGuard(['admin', 'super_admin'])); 

// Identity & Theme
router.get('/identity', AdminProfileController.getIdentity);
router.patch('/identity', AdminProfileController.updateIdentity);
router.patch('/identity/theme', AdminProfileController.updateTheme); // নতুন রাউট

// Performance
router.get('/performance', AdminProfileController.getPerformance);

// Security
router.get('/security', AdminProfileController.getSecurityDetails);
router.patch('/security/2fa', AdminProfileController.toggle2FA);
router.delete('/security/sessions/:sessionId', AdminProfileController.terminateSession);

// Permissions & Audits
router.get('/permissions', AdminProfileController.getPermissions);
router.get('/audits', AdminProfileController.getAuditTrail);

export default router;
