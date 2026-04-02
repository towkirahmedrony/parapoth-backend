import { Request, Response } from 'express';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response';
import * as NotificationUserService from './notifications.user.service';

export const getUserNotifications = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const notifications = await NotificationUserService.getUserNotifications(userId);
  
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Notifications fetched successfully',
    data: notifications
  });
});

export const markAsRead = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { notification_id, is_clicked } = req.body;
  
  await NotificationUserService.markNotificationAsRead(userId, notification_id, is_clicked);
  
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Notification marked as read'
  });
});
