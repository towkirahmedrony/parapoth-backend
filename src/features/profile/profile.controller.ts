import { Request, Response } from 'express';
import { ProfileService } from './profile.service';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response'; 

export const getMyProfile = catchAsync(async (req: Request, res: Response) => {
  const profile = await ProfileService.getProfileById(req.user!.id);
  sendResponse(res, 200, true, 'Profile retrieved', profile);
});

export const updateProfile = catchAsync(async (req: Request, res: Response) => {
  const updated = await ProfileService.updateProfile(req.user!.id, req.body);
  sendResponse(res, 200, true, 'Profile updated successfully', updated);
});

// নতুন কন্ট্রোলার মেথড: থিম আপডেট
export const updateThemePreference = catchAsync(async (req: Request, res: Response) => {
  const { theme } = req.body;
  const updatedSettings = await ProfileService.updateThemePreference(req.user!.id, theme);
  sendResponse(res, 200, true, 'Theme preference updated', updatedSettings);
});

export const getPublicProfile = catchAsync(async (req: Request, res: Response) => {
  const { identifier } = req.params;
  const profile = await ProfileService.getPublicProfile(identifier);
  
  const [badges, activity] = await Promise.all([
    ProfileService.getUserBadges(profile.id),
    ProfileService.getActivityStats(profile.id)
  ]);

  sendResponse(res, 200, true, 'Public profile fetched', {
    ...profile,
    badges,
    activity
  });
});

export const getVersusStats = catchAsync(async (req: Request, res: Response) => {
  const myId = req.user!.id;
  const opponentId = req.params.opponentId;

  const [me, opponent] = await Promise.all([
    ProfileService.getProfileById(myId),
    ProfileService.getPublicProfile(opponentId)
  ]);

  sendResponse(res, 200, true, 'Versus stats fetched', {
    me: { xp: me.total_xp, streak: me.current_streak, rating: me.pvp_rating },
    opponent: { xp: opponent.total_xp, streak: opponent.current_streak, rating: opponent.pvp_rating }
  });
});
