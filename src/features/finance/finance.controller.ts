import { Request, Response } from 'express';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response';
import * as financeService from './finance.service';

// --- User App Controllers ---

export const getActivePlans = catchAsync(async (req: Request, res: Response) => {
  const plans = await financeService.getActivePlans();
  sendResponse(res, { statusCode: 200, success: true, message: 'Active plans fetched successfully', data: plans });
});

export const getPaymentMethods = catchAsync(async (req: Request, res: Response) => {
  const methods = await financeService.getPaymentMethods();
  sendResponse(res, { statusCode: 200, success: true, message: 'Payment methods fetched successfully', data: methods });
});

export const submitPaymentClaim = catchAsync(async (req: Request, res: Response) => {
  // Assuming req.user is set by requireAuth middleware
  const userId = (req as any).user.id; 
  const payload = { ...req.body, user_id: userId };
  const claim = await financeService.submitPaymentClaim(payload);
  sendResponse(res, { statusCode: 201, success: true, message: 'Payment claim submitted successfully', data: claim });
});


// --- Admin Panel Controllers ---

export const getCoinEconomyStats = catchAsync(async (req: Request, res: Response) => {
  const stats = await financeService.getCoinEconomyStats();
  sendResponse(res, { statusCode: 200, success: true, message: 'Coin economy stats fetched successfully', data: stats });
});

export const getParsers = catchAsync(async (req: Request, res: Response) => {
  const parsers = await financeService.getParsers();
  sendResponse(res, { statusCode: 200, success: true, message: 'Payment parsers fetched successfully', data: parsers });
});

export const updateParser = catchAsync(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const parser = await financeService.updateParser(id, req.body);
  sendResponse(res, { statusCode: 200, success: true, message: 'Payment parser updated successfully', data: parser });
});

export const getPendingPayments = catchAsync(async (req: Request, res: Response) => {
  const payments = await financeService.getPendingPayments();
  sendResponse(res, { statusCode: 200, success: true, message: 'Pending payments fetched successfully', data: payments });
});

export const getUnclaimedSmsLogs = catchAsync(async (req: Request, res: Response) => {
  const logs = await financeService.getUnclaimedSmsLogs();
  sendResponse(res, { statusCode: 200, success: true, message: 'Unclaimed SMS logs fetched successfully', data: logs });
});

export const approvePayment = catchAsync(async (req: Request, res: Response) => {
  const requestId = req.params.id;
  const result = await financeService.approvePayment(requestId);
  sendResponse(res, { statusCode: 200, success: true, message: 'Payment approved successfully', data: result });
});

export const rejectPayment = catchAsync(async (req: Request, res: Response) => {
  const requestId = req.params.id;
  const { reason } = req.body;
  const result = await financeService.rejectPayment(requestId, reason);
  sendResponse(res, { statusCode: 200, success: true, message: 'Payment rejected successfully', data: result });
});

export const getRevenueAnalytics = catchAsync(async (req: Request, res: Response) => {
  const analytics = await financeService.getRevenueAnalytics();
  sendResponse(res, { statusCode: 200, success: true, message: 'Revenue analytics fetched successfully', data: analytics });
});
