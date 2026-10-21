import { Request, Response } from 'express';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response';
import * as accessService from './access.service';

export const getMyAccess = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const status = await accessService.getQuotaStatus(userId);
  sendResponse(res, { statusCode: 200, success: true, message: 'Access status fetched', data: status });
});

// Admin Controllers
export const getQuotas = catchAsync(async (req: Request, res: Response) => {
  const quotas = await accessService.getQuotas();
  sendResponse(res, { statusCode: 200, success: true, message: 'Quotas fetched', data: quotas });
});

export const updateQuota = catchAsync(async (req: Request, res: Response) => {
  const result = await accessService.updateQuota(req.params.feature, req.body);
  sendResponse(res, { statusCode: 200, success: true, message: 'Quota updated', data: result });
});

export const getGrants = catchAsync(async (req: Request, res: Response) => {
  const grants = await accessService.getGrants(req.query);
  sendResponse(res, { statusCode: 200, success: true, message: 'Grants fetched', data: grants });
});

export const createGrant = catchAsync(async (req: Request, res: Response) => {
  const adminId = (req as any).user.id;
  const { confirm, ...payload } = req.body;
  
  if (payload.scope === 'all' && confirm !== true) {
    return sendResponse(res, { statusCode: 400, success: false, message: 'Confirmation required for all-users grant' });
  }

  const result = await accessService.createGrant(payload, adminId);
  sendResponse(res, { statusCode: 201, success: true, message: 'Grant created', data: result });
});

export const revokeGrant = catchAsync(async (req: Request, res: Response) => {
  const adminId = (req as any).user.id;
  const result = await accessService.revokeGrant(req.params.id, adminId);
  sendResponse(res, { statusCode: 200, success: true, message: 'Grant revoked', data: result });
});

export const searchUsers = catchAsync(async (req: Request, res: Response) => {
  const result = await accessService.searchUsers(req.query.q as string);
  sendResponse(res, { statusCode: 200, success: true, message: 'Users found', data: result });
});

export const getUserAccess = catchAsync(async (req: Request, res: Response) => {
  const result = await accessService.getUserAccessDetails(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: 'User access details fetched', data: result });
});

export const resetUserUsage = catchAsync(async (req: Request, res: Response) => {
  const result = await accessService.resetUsage(req.params.id, req.body.feature);
  sendResponse(res, { statusCode: 200, success: true, message: 'Usage reset successful', data: result });
});

export const getOverview = catchAsync(async (req: Request, res: Response) => {
  const overview = await accessService.getOverview();
  sendResponse(res, { statusCode: 200, success: true, message: 'Access overview fetched', data: overview });
});
