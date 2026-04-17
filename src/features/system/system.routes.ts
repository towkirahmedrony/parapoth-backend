import { Router } from 'express';
import * as SystemController from './system.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';

const router = Router();

// ==========================================
// Publicly accessible configurations
// ==========================================
router.get('/home-grids', SystemController.getHomeGrids);
router.get('/theme-config', SystemController.getThemeConfig);

// সব কনফিগ বা নির্দিষ্ট কী দিয়ে কনফিগ আনা
router.get('/configs', SystemController.getAppConfigs);
router.get('/configs/:key', SystemController.getAppConfigs);

// ==========================================
// Admin guarded routes
// ==========================================
const adminGuard = [requireAuth, rbacGuard(['admin', 'super_admin'])];

router.post('/request-otp', adminGuard, SystemController.requestAdminOTP);

router.post('/home-grids', adminGuard, SystemController.upsertHomeGrid);
router.patch('/home-grids/reorder', adminGuard, SystemController.reorderHomeGrids);
router.delete('/home-grids/:id', adminGuard, SystemController.deleteHomeGrid);

// কনফিগ আপডেট (বডি বা URL থেকে কী নিবে)
router.put('/configs', adminGuard, SystemController.updateAppConfig);
router.post('/configs/:key', adminGuard, SystemController.updateAppConfig);

// XP Rules specific route
router.put('/xp-rules', adminGuard, SystemController.updateXPRules);

// League Levels
router.get('/levels', adminGuard, SystemController.getLevels);
router.put('/levels', adminGuard, SystemController.updateLevels);

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
