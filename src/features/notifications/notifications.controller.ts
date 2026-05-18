import { Request, Response } from 'express';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response';
import * as NotificationService from './notifications.service';

const getClientIp = (req: Request): string | null => {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = req.headers['x-real-ip'];

  if (typeof realIp === 'string' && realIp.length > 0) {
    return realIp;
  }

  return req.ip || req.socket.remoteAddress || null;
};

export const getMyNotifications = catchAsync(async (req: Request, res: Response) => {
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
  const ipAddress = getClientIp(req);

  console.log('DEVICE TOKEN DEBUG:', {
    userId,
    device_id: req.body?.device_id,
    device_name: req.body?.device_name,
    ipAddress,
    xForwardedFor: req.headers['x-forwarded-for'],
    xRealIp: req.headers['x-real-ip'],
    reqIp: req.ip,
    remoteAddress: req.socket.remoteAddress,
  });
  
  await NotificationService.saveUserDeviceToken(userId, {
    ...req.body,
    ip_address: ipAddress,
  });
  
  sendResponse(res, 200, true, 'Device token updated successfully', {
    ip_address: ipAddress,
  });
});
