import { Router } from 'express';
import * as SystemController from './system.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';

const router = Router();

// ==========================================
// Publicly accessible configurations
// (সাধারণ ইউজারদের অ্যাপ লোড হওয়ার সময় এগুলো লাগবে)
// ==========================================
router.get('/home-grids', SystemController.getHomeGrids);
router.get('/theme-config', SystemController.getThemeConfig);
router.get('/configs', SystemController.getAppConfigs); // <-- এটিকে পাবলিক করা হলো

// ==========================================
// Admin guarded routes
// (শুধুমাত্র অ্যাডমিনরা এই কাজগুলো করতে পারবে)
// ==========================================
const adminGuard = [requireAuth, rbacGuard(['admin', 'super_admin'])];

router.post('/request-otp', adminGuard, SystemController.requestAdminOTP);

router.post('/home-grids', adminGuard, SystemController.upsertHomeGrid);
router.patch('/home-grids/reorder', adminGuard, SystemController.reorderHomeGrids);
router.delete('/home-grids/:id', adminGuard, SystemController.deleteHomeGrid);

// কনফিগ সেভ করার অধিকার শুধু অ্যাডমিনের
router.put('/configs', adminGuard, SystemController.updateAppConfig);

router.get('/emergency-flags', adminGuard, SystemController.getEmergencyFlags);
router.post('/emergency-flags', adminGuard, SystemController.createEmergencyFlag);
router.patch('/emergency-flags/:key', adminGuard, SystemController.toggleEmergencyFlag);

router.get('/support-tickets', adminGuard, SystemController.getSupportTickets);
router.patch('/support-tickets/:id', adminGuard, SystemController.updateSupportTicket);

router.get('/audit-logs', adminGuard, SystemController.getAuditLogs);

router.get('/alerts', adminGuard, SystemController.getAdminAlerts);
router.patch('/alerts/:id/resolve', adminGuard, SystemController.resolveAdminAlert);

// Global Notice
router.put('/global-notice', adminGuard, SystemController.updateGlobalNotice);

export default router;
