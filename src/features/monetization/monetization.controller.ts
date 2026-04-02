import { Request, Response } from 'express';
import * as monetizationService from './monetization.service';
// Default import ব্যবহার করা হলো
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response'; 

export const getPlans = catchAsync(async (req: Request, res: Response) => {
  const plans = await monetizationService.getPlans();
  sendResponse(res, { statusCode: 200, success: true, message: 'Plans fetched successfully', data: plans });
});

export const createPlan = catchAsync(async (req: Request, res: Response) => {
  const plan = await monetizationService.createPlan(req.body);
  sendResponse(res, { statusCode: 201, success: true, message: 'Plan created successfully', data: plan });
});

export const deletePlan = catchAsync(async (req: Request, res: Response) => {
  await monetizationService.deletePlan(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: 'Plan deleted successfully' });
});

export const getCoupons = catchAsync(async (req: Request, res: Response) => {
  const coupons = await monetizationService.getCoupons();
  sendResponse(res, { statusCode: 200, success: true, message: 'Coupons fetched successfully', data: coupons });
});

export const createCoupon = catchAsync(async (req: Request, res: Response) => {
  const coupon = await monetizationService.createCoupon(req.body);
  sendResponse(res, { statusCode: 201, success: true, message: 'Coupon created successfully', data: coupon });
});

export const deleteCoupon = catchAsync(async (req: Request, res: Response) => {
  await monetizationService.deleteCoupon(req.params.code);
  sendResponse(res, { statusCode: 200, success: true, message: 'Coupon deleted successfully' });
});

export const getAchievements = catchAsync(async (req: Request, res: Response) => {
  const achievements = await monetizationService.getAchievements();
  sendResponse(res, { statusCode: 200, success: true, message: 'Achievements fetched successfully', data: achievements });
});

export const createAchievement = catchAsync(async (req: Request, res: Response) => {
  const achievement = await monetizationService.createAchievement(req.body);
  sendResponse(res, { statusCode: 201, success: true, message: 'Achievement created successfully', data: achievement });
});

export const getQuests = catchAsync(async (req: Request, res: Response) => {
  const quests = await monetizationService.getQuests();
  sendResponse(res, { statusCode: 200, success: true, message: 'Quests fetched successfully', data: quests });
});

export const createQuest = catchAsync(async (req: Request, res: Response) => {
  const quest = await monetizationService.createQuest(req.body);
  sendResponse(res, { statusCode: 201, success: true, message: 'Quest created successfully', data: quest });
});

export const grantManualOverride = catchAsync(async (req: Request, res: Response) => {
  const result = await monetizationService.grantManualSubscription(req.body);
  sendResponse(res, { statusCode: 200, success: true, message: 'Manual subscription granted successfully', data: result });
});
