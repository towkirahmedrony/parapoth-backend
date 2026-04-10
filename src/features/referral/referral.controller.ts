import { Request, Response } from 'express';
import { ReferralService } from './referral.service';
// Named import এর পরিবর্তে Default import ব্যবহার করা হয়েছে
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response';

export const getStats = catchAsync(async (req: Request, res: Response) => {
  // as string ব্যবহার করে undefined টাইপ এরর ফিক্স করা হয়েছে
  const userId = req.user?.id as string; 
  const stats = await ReferralService.getStats(userId);
  
  sendResponse(res, 200, true, 'Referral stats fetched successfully', stats);
});

export const getHistory = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id as string;
  const history = await ReferralService.getHistory(userId);
  
  sendResponse(res, 200, true, 'Referral history fetched successfully', history);
});

export const redeemCode = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id as string;
  const { code } = req.body;
  
  const result = await ReferralService.redeemCode(userId, code);
  sendResponse(res, 200, true, result.message, result);
});
