import { Request, Response } from 'express';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response'; // <-- Named import থেকে Default import করা হলো
import * as progressService from './progress.service';

export const getDashboardData = catchAsync(async (req: Request, res: Response) => {
  // Assuming req.user is set by requireAuth middleware
  const userId = req.user?.id; 

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized access' });
  }

  const data = await progressService.getProgressDashboardData(userId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Progress dashboard data retrieved successfully',
    data
  });
});
