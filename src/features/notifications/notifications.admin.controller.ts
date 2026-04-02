import { Request, Response } from 'express';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response';
import * as NotificationAdminService from './notifications.admin.service';

export const createCampaign = catchAsync(async (req: Request, res: Response) => {
  const adminId = req.user!.id; 
  const campaign = await NotificationAdminService.createCampaign(req.body, adminId);
  sendResponse(res, { statusCode: 201, success: true, message: 'Campaign deployed successfully', data: campaign });
});

export const getCampaigns = catchAsync(async (req: Request, res: Response) => {
  const campaigns = await NotificationAdminService.getCampaigns();
  sendResponse(res, { statusCode: 200, success: true, message: 'Campaigns fetched successfully', data: campaigns });
});

export const cancelCampaign = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const campaign = await NotificationAdminService.cancelCampaign(id);
  sendResponse(res, { statusCode: 200, success: true, message: 'Campaign cancelled successfully', data: campaign });
});

// --- Global Notices Controllers ---
export const createNotice = catchAsync(async (req: Request, res: Response) => {
  const adminId = req.user!.id;
  const notice = await NotificationAdminService.createNotice(req.body, adminId);
  sendResponse(res, { statusCode: 201, success: true, message: 'Notice created successfully', data: notice });
});

export const getNotices = catchAsync(async (req: Request, res: Response) => {
  const notices = await NotificationAdminService.getNotices();
  sendResponse(res, { statusCode: 200, success: true, message: 'Notices fetched successfully', data: notices });
});

export const deleteNotice = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const notice = await NotificationAdminService.deleteNotice(id);
  sendResponse(res, { statusCode: 200, success: true, message: 'Notice deleted successfully', data: notice });
});
