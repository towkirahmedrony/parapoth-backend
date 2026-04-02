import { Request, Response } from 'express';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response';
import * as NotificationService from './notifications.service';

export const getMyNotifications = catchAsync(async (req: Request, res: Response) => {
  // Assuming `req.user` is populated by the `requireAuth` middleware
  const userId = (req as any).user?.id; 
  
  const notifications = await NotificationService.getUserNotifications(userId);
  
  sendResponse(res, 200, true, 'Notifications retrieved successfully', notifications);
});

export const markAsRead = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  
  await NotificationService.markNotificationAsRead(userId, req.body);
  
  sendResponse(res, 200, true, 'Notification marked as read');
});

export const updateDeviceToken = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  
  await NotificationService.saveUserDeviceToken(userId, req.body);
  
  sendResponse(res, 200, true, 'Device token updated successfully');
});
