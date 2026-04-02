import { Request, Response } from 'express';
import * as AdminProfileService from './profile.admin.service';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response'; // <-- Default import করা হলো

export const getIdentity = catchAsync(async (req: Request, res: Response) => {
  const adminId = (req as any).user.id;
  const data = await AdminProfileService.getAdminIdentity(adminId);
  sendResponse(res, { statusCode: 200, success: true, message: 'Admin identity fetched successfully', data });
});

export const updateIdentity = catchAsync(async (req: Request, res: Response) => {
  const adminId = (req as any).user.id;
  const data = await AdminProfileService.updateAdminIdentity(adminId, req.body);
  sendResponse(res, { statusCode: 200, success: true, message: 'Admin profile updated successfully', data });
});

export const getPerformance = catchAsync(async (req: Request, res: Response) => {
  const adminId = (req as any).user.id;
  const timeframe = req.query.timeframe as string || 'this_month';
  const data = await AdminProfileService.getAdminPerformance(adminId, timeframe);
  sendResponse(res, { statusCode: 200, success: true, message: 'Performance stats fetched successfully', data });
});

export const getSecurityDetails = catchAsync(async (req: Request, res: Response) => {
  const adminId = (req as any).user.id;
  const data = await AdminProfileService.getSecurityData(adminId);
  sendResponse(res, { statusCode: 200, success: true, message: 'Security details fetched successfully', data });
});

export const terminateSession = catchAsync(async (req: Request, res: Response) => {
  const adminId = (req as any).user.id;
  const { sessionId } = req.params;
  await AdminProfileService.terminateSession(adminId, sessionId);
  sendResponse(res, { statusCode: 200, success: true, message: 'Session terminated successfully' });
});

export const toggle2FA = catchAsync(async (req: Request, res: Response) => {
  const adminId = (req as any).user.id;
  const { is_enabled } = req.body;
  const data = await AdminProfileService.toggle2FA(adminId, is_enabled);
  sendResponse(res, { statusCode: 200, success: true, message: '2FA settings updated', data });
});

export const getPermissions = catchAsync(async (req: Request, res: Response) => {
  const adminId = (req as any).user.id;
  const data = await AdminProfileService.getAdminPermissions(adminId);
  sendResponse(res, { statusCode: 200, success: true, message: 'Permissions fetched successfully', data });
});

export const getAuditTrail = catchAsync(async (req: Request, res: Response) => {
  const adminId = (req as any).user.id;
  const data = await AdminProfileService.getAdminAuditTrail(adminId);
  sendResponse(res, { statusCode: 200, success: true, message: 'Audit trail fetched successfully', data });
});
