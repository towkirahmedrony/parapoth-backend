import { Request, Response } from 'express';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response';
import * as enterpriseService from './enterprise.service';

export const getStaffList = catchAsync(async (req: Request, res: Response) => {
  const staff = await enterpriseService.fetchStaffList();
  sendResponse(res, { statusCode: 200, success: true, message: 'Staff list retrieved successfully', data: staff });
});

export const assignStaffRole = catchAsync(async (req: Request, res: Response) => {
  const { email, role } = req.body;
  const result = await enterpriseService.assignRoleToUser(email, role);
  sendResponse(res, { statusCode: 200, success: true, message: 'Staff role assigned successfully', data: result });
});

export const removeStaffAccess = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  await enterpriseService.revokeStaffAccess(id);
  sendResponse(res, { statusCode: 200, success: true, message: 'Staff access revoked successfully' });
});

export const getPermissions = catchAsync(async (req: Request, res: Response) => {
  const permissions = await enterpriseService.fetchPermissions();
  sendResponse(res, { statusCode: 200, success: true, message: 'Permissions retrieved successfully', data: permissions });
});

export const togglePermission = catchAsync(async (req: Request, res: Response) => {
  const { permId, role } = req.body;
  const updated = await enterpriseService.toggleRolePermission(permId, role);
  sendResponse(res, { statusCode: 200, success: true, message: 'Permission toggled successfully', data: updated });
});

export const getActiveSessions = catchAsync(async (req: Request, res: Response) => {
  const sessions = await enterpriseService.fetchActiveSessions();
  sendResponse(res, { statusCode: 200, success: true, message: 'Active sessions retrieved', data: sessions });
});

export const revokeSession = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  await enterpriseService.revokeAdminSession(id);
  sendResponse(res, { statusCode: 200, success: true, message: 'Session revoked successfully' });
});

export const getSecurityAuditLogs = catchAsync(async (req: Request, res: Response) => {
  const logs = await enterpriseService.fetchSecurityLogs();
  sendResponse(res, { statusCode: 200, success: true, message: 'Security audit logs retrieved', data: logs });
});

export const getFeatureFlags = catchAsync(async (req: Request, res: Response) => {
  const flags = await enterpriseService.fetchFeatureFlags();
  sendResponse(res, { statusCode: 200, success: true, message: 'Feature flags retrieved', data: flags });
});

export const toggleFeatureFlag = catchAsync(async (req: Request, res: Response) => {
  const { key } = req.params;
  const { is_enabled } = req.body;
  const flag = await enterpriseService.updateFeatureFlag(key, is_enabled);
  sendResponse(res, { statusCode: 200, success: true, message: 'Feature flag updated', data: flag });
});

export const getReports = catchAsync(async (req: Request, res: Response) => {
  const reports = await enterpriseService.fetchReports();
  sendResponse(res, { statusCode: 200, success: true, message: 'Reports retrieved successfully', data: reports });
});

export const requestReport = catchAsync(async (req: Request, res: Response) => {
  const { report_type, filters } = req.body;
  // user object is expected to be attached by requireAuth middleware
  const requestedBy = (req as any).user?.id; 
  const report = await enterpriseService.createNewReportRequest(report_type, filters, requestedBy);
  sendResponse(res, { statusCode: 201, success: true, message: 'Report generation requested', data: report });
});
