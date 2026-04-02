import { Request, Response } from 'express';
import * as historyService from './history.service';
import catchAsync from '../../lib/utils/catchAsync'; // <-- ব্র্যাকেট {} সরিয়ে Default Import করা হয়েছে

export const getExamHistory = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id; 
  const history = await historyService.getUserExamHistory(userId);
  
  res.status(200).json({ success: true, data: history });
});

export const getMistakes = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const mistakes = await historyService.getUserMistakes(userId);
  
  res.status(200).json({ success: true, data: mistakes });
});

export const getBookmarks = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const bookmarks = await historyService.getUserBookmarks(userId);
  
  res.status(200).json({ success: true, data: bookmarks });
});

export const deleteMistake = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  
  await historyService.deleteMistakeRecord(id, userId);
  res.status(200).json({ success: true, message: 'Mistake removed successfully' });
});

export const deleteBookmark = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  
  await historyService.deleteBookmarkRecord(id, userId);
  res.status(200).json({ success: true, message: 'Bookmark removed successfully' });
});
