import { Router } from 'express';
import * as SystemController from './system.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';

const router = Router();
const adminGuard = [requireAuth, rbacGuard(['admin', 'super_admin'])];

router.post('/request-otp', adminGuard, SystemController.requestAdminOTP);

router.get('/emergency-flags', adminGuard, SystemController.getEmergencyFlags);
router.post('/emergency-flags', adminGuard, SystemController.createEmergencyFlag);
router.patch('/emergency-flags/:key', adminGuard, SystemController.toggleEmergencyFlag);

router.get('/support-tickets', adminGuard, SystemController.getSupportTickets);
router.patch('/support-tickets/:id', adminGuard, SystemController.updateSupportTicket);

router.get('/audit-logs', adminGuard, SystemController.getAuditLogs);

router.get('/alerts', adminGuard, SystemController.getAdminAlerts);
router.patch('/alerts/:id/resolve', adminGuard, SystemController.resolveAdminAlert);

export default router;
