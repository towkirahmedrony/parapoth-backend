import { Request, Response } from 'express';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response';
import * as StreakService from './streak.service';

export const getStreakStats = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.id; // Assuming `requireAuth` middleware populates `req.user`
  const stats = await StreakService.getStreakStats(userId);
  
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Streak stats retrieved successfully',
    data: stats,
  });
});

export const getHeatmap = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const heatmap = await StreakService.getHeatmap(userId);
  
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Heatmap data retrieved successfully',
    data: heatmap,
  });
});

export const getDailyQuests = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const quests = await StreakService.getDailyQuests(userId);
  
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Daily quests retrieved successfully',
    data: quests,
  });
});
