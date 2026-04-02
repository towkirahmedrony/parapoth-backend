import { Request, Response } from 'express';
import catchAsync from '../../lib/utils/catchAsync';
import * as dashboardService from './dashboard.admin.service';

export const getDashboardStats = catchAsync(async (req: Request, res: Response) => {
  // Assuming req.user is populated by requireAuth middleware
  const adminId = (req as any).user?.id;

  if (!adminId) {
    return res.status(401).json({ success: false, message: 'Unauthorized access' });
  }

  const [
    liveMetrics,
    activeExams,
    securityAlerts,
    adminPerformance,
    pendingPayments,
    moderationQueue
  ] = await Promise.all([
    dashboardService.getLiveMetrics(),
    dashboardService.getActiveExams(),
    dashboardService.getSecurityAlerts(),
    dashboardService.getAdminPerformance(adminId),
    dashboardService.getPendingPayments(),
    dashboardService.getModerationQueue()
  ]);

  res.status(200).json({
    success: true,
    data: {
      liveMetrics,
      activeExams,
      securityAlerts,
      adminPerformance,
      pendingPayments,
      moderationQueue
    }
  });
});
