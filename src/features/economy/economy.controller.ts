import { Request, Response } from 'express';
import { economyService } from './economy.service';
import catchAsync from '../../lib/utils/catchAsync';

// === ইউজার কন্ট্রোলার ===
export const getUserBalance = catchAsync(async (req: any, res: Response) => {
  const userId = req.user.id;
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
  
  if (!item_id) return res.status(400).json({ success: false, message: 'Item ID is required' });

  const data = await economyService.purchaseItem(userId, item_id);
  res.status(200).json(data);
});

// === এডমিন কন্ট্রোলার ===
export const getAdminMarketplaceItems = catchAsync(async (req: Request, res: Response) => {
  const data = await economyService.getAdminMarketplaceItems();
  res.status(200).json(data);
});

export const createMarketplaceItem = catchAsync(async (req: Request, res: Response) => {
  const data = await economyService.createMarketplaceItem(req.body);
  res.status(201).json(data);
});

export const updateMarketplaceItem = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = await economyService.updateMarketplaceItem(id, req.body);
  res.status(200).json(data);
});

export const deleteMarketplaceItem = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = await economyService.deleteMarketplaceItem(id);
  res.status(200).json(data);
});
