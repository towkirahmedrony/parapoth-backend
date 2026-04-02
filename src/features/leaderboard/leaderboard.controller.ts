import { Request, Response } from 'express';
import { leaderboardService } from './leaderboard.service';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response'; // সেকেন্ড ব্র্যাকেট ফেলে দেওয়া হলো

export const getLeagueLeaderboard = catchAsync(async (req: Request, res: Response) => {
  const { min_xp, max_xp } = req.query;
  const userId = (req as any).user?.id;

  const data = await leaderboardService.getGlobalLeaderboard(
    Number(min_xp || 0),
    Number(max_xp || 1000000),
    userId
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'League leaderboard fetched successfully',
    data
  });
});

export const getSquadLeaderboard = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;

  const data = await leaderboardService.getGroupLeaderboard(userId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Squad leaderboard fetched successfully',
    data
  });
});
