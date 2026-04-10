import { Request, Response } from 'express';
import { leaderboardService } from './leaderboard.service';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response';

export const getLeagueLeaderboard = catchAsync(async (req: Request, res: Response) => {
  const { min_xp, max_xp } = req.query;
  const userId = (req as any).user?.id;

  // Handle null max_xp for the highest tier (Legend)
  const parsedMinXp = Number(min_xp) || 0;
  const parsedMaxXp = (max_xp === 'null' || max_xp === undefined) ? null : Number(max_xp);

  const data = await leaderboardService.getGlobalLeaderboard(
    parsedMinXp,
    parsedMaxXp,
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
