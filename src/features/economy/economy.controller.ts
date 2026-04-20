import { Request, Response } from 'express';
import { economyService } from './economy.service';
import catchAsync from '../../lib/utils/catchAsync';

export const getUserBalance = catchAsync(async (req: any, res: Response) => {
  const userId = req.user.id; // requireAuth মিডলওয়্যার থেকে আসবে
  const data = await economyService.getUserBalance(userId);
  res.status(200).json(data);
});

export const getMarketplaceItems = catchAsync(async (req: Request, res: Response) => {
  const data = await economyService.getMarketplaceItems();
  res.status(200).json(data);
});

export const purchaseItem = catchAsync(async (req: any, res: Response) => {
  const userId = req.user.id;
  const { item_id } = req.body;
  
  if (!item_id) {
    return res.status(400).json({ success: false, message: 'Item ID is required' });
  }

  const data = await economyService.purchaseItem(userId, item_id);
  res.status(200).json(data);
});
