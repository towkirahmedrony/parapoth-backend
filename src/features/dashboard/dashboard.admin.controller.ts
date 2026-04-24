import { Request, Response } from 'express';
import catchAsync from '../../lib/utils/catchAsync';
import * as dashboardService from './dashboard.admin.service';

interface AuthenticatedRequest extends Request {
  user?: Request['user'] & {
    role?: string;
  };
}

export const getDashboardStats = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const adminId = req.user?.id;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized access',
      });
    }

    const [
      liveMetrics,
      activeExams,
      securityAlerts,
      adminPerformance,
      pendingPayments,
      moderationQueue,
      activeBanners, // New Data Added
    ] = await Promise.all([
      dashboardService.getLiveMetrics(),
      dashboardService.getActiveExams(),
      dashboardService.getSecurityAlerts(),
      dashboardService.getAdminPerformance(adminId),
      dashboardService.getPendingPayments(),
      dashboardService.getModerationQueue(),
      dashboardService.getActiveBanners(), // Call new service
    ]);

    return res.status(200).json({
      success: true,
      data: {
        liveMetrics,
        activeExams,
        securityAlerts,
        adminPerformance,
        pendingPayments,
        moderationQueue,
        activeBanners, // Return in response
      },
    });
  }
);
