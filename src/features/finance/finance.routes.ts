import { Router } from 'express';
import * as financeController from './finance.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';

const router = Router();

// ==========================================
// 📱 USER APP ROUTES (Public & Authenticated)
// ==========================================
router.get('/plans', financeController.getActivePlans);
router.get('/methods', financeController.getPaymentMethods);
router.post('/payments/claim', requireAuth, financeController.submitPaymentClaim);

// ==========================================
// 💻 ADMIN PANEL ROUTES (Protected)
// ==========================================
// Apply admin guards for the routes below
const adminMiddleware = [requireAuth, rbacGuard(['admin', 'finance'])];

// Coin Economy Dashboard
router.get('/coins/stats', adminMiddleware, financeController.getCoinEconomyStats);

// SMS Parser Engine
router.get('/parsers', adminMiddleware, financeController.getParsers);
router.put('/parsers/:id', adminMiddleware, financeController.updateParser);

// Payment Approvals
router.get('/payments/pending', adminMiddleware, financeController.getPendingPayments);
router.get('/payments/sms-logs', adminMiddleware, financeController.getUnclaimedSmsLogs);
router.post('/payments/:id/approve', adminMiddleware, financeController.approvePayment);
router.post('/payments/:id/reject', adminMiddleware, financeController.rejectPayment);

// Revenue Analytics
router.get('/revenue/analytics', adminMiddleware, financeController.getRevenueAnalytics);

export const financeRoutes = router;
