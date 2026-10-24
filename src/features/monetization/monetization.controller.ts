import { Request, Response } from 'express';
import * as monetizationService from './monetization.service';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response'; 
import { parseLanguage } from '../../lib/utils/language';
import { recordAdminAudit } from '../../lib/utils/adminAudit';

export const getPlans = catchAsync(async (req: Request, res: Response) => {
  const plans = await monetizationService.getPlans(parseLanguage(req.query.lang));
  sendResponse(res, { statusCode: 200, success: true, message: 'Plans fetched successfully', data: plans });
});

export const createPlan = catchAsync(async (req: Request, res: Response) => {
  const plan = await monetizationService.createPlan(req.body);
  await recordAdminAudit((req as any).user?.id, 'monetization.plan.create', 'plans', plan?.id);
  sendResponse(res, { statusCode: 201, success: true, message: 'Plan created successfully', data: plan });
});

export const deletePlan = catchAsync(async (req: Request, res: Response) => {
  await monetizationService.deletePlan(req.params.id);
  await recordAdminAudit((req as any).user?.id, 'monetization.plan.delete', 'plans', req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: 'Plan deleted successfully' });
});

export const getCoupons = catchAsync(async (req: Request, res: Response) => {
  const coupons = await monetizationService.getCoupons();
  sendResponse(res, { statusCode: 200, success: true, message: 'Coupons fetched successfully', data: coupons });
});

export const createCoupon = catchAsync(async (req: Request, res: Response) => {
  const coupon = await monetizationService.createCoupon(req.body);
  await recordAdminAudit((req as any).user?.id, 'monetization.coupon.create', 'coupons', coupon?.code);
  sendResponse(res, { statusCode: 201, success: true, message: 'Coupon created successfully', data: coupon });
});

export const deleteCoupon = catchAsync(async (req: Request, res: Response) => {
  await monetizationService.deleteCoupon(req.params.code);
  await recordAdminAudit((req as any).user?.id, 'monetization.coupon.delete', 'coupons', req.params.code);
  sendResponse(res, { statusCode: 200, success: true, message: 'Coupon deleted successfully' });
});

export const getAchievements = catchAsync(async (req: Request, res: Response) => {
  const achievements = await monetizationService.getAchievements();
  sendResponse(res, { statusCode: 200, success: true, message: 'Achievements fetched successfully', data: achievements });
});

export const createAchievement = catchAsync(async (req: Request, res: Response) => {
  const achievement = await monetizationService.createAchievement(req.body);
  await recordAdminAudit((req as any).user?.id, 'monetization.achievement.create', 'achievements', achievement?.id);
  sendResponse(res, { statusCode: 201, success: true, message: 'Achievement created successfully', data: achievement });
});

export const getQuests = catchAsync(async (req: Request, res: Response) => {
  const quests = await monetizationService.getQuests();
  sendResponse(res, { statusCode: 200, success: true, message: 'Quests fetched successfully', data: quests });
});

export const createQuest = catchAsync(async (req: Request, res: Response) => {
  const quest = await monetizationService.createQuest(req.body);
  await recordAdminAudit((req as any).user?.id, 'monetization.quest.create', 'quests', quest?.id);
  sendResponse(res, { statusCode: 201, success: true, message: 'Quest created successfully', data: quest });
});

export const grantManualOverride = catchAsync(async (req: Request, res: Response) => {
  const result = await monetizationService.grantManualSubscription(req.body);
  await recordAdminAudit((req as any).user?.id, 'monetization.subscription.manual_grant', 'profiles', req.body?.user_id ?? req.body?.userId);
  sendResponse(res, { statusCode: 200, success: true, message: 'Manual subscription granted successfully', data: result });
});

// ================= Marketplace Items =================
export const getMarketplaceItems = catchAsync(async (req: Request, res: Response) => {
  const items = await monetizationService.getMarketplaceItems(parseLanguage(req.query.lang));
  sendResponse(res, { statusCode: 200, success: true, message: 'Marketplace items fetched successfully', data: items });
});

export const getPublicMarketplaceItems = catchAsync(async (req: Request, res: Response) => {
  const items = await monetizationService.getActiveMarketplaceItems(parseLanguage(req.query.lang));
  sendResponse(res, { statusCode: 200, success: true, message: 'Marketplace items fetched successfully', data: items });
});

export const createMarketplaceItem = catchAsync(async (req: Request, res: Response) => {
  const item = await monetizationService.createMarketplaceItem(req.body);
  await recordAdminAudit((req as any).user?.id, 'monetization.marketplace.create', 'marketplace_items', item?.id);
  sendResponse(res, { statusCode: 201, success: true, message: 'Marketplace item created successfully', data: item });
});

export const updateMarketplaceItem = catchAsync(async (req: Request, res: Response) => {
  const item = await monetizationService.updateMarketplaceItem(req.params.id, req.body);
  await recordAdminAudit((req as any).user?.id, 'monetization.marketplace.update', 'marketplace_items', item?.id);
  sendResponse(res, { statusCode: 200, success: true, message: 'Marketplace item updated successfully', data: item });
});

export const deleteMarketplaceItem = catchAsync(async (req: Request, res: Response) => {
  await monetizationService.deleteMarketplaceItem(req.params.id);
  await recordAdminAudit((req as any).user?.id, 'monetization.marketplace.delete', 'marketplace_items', req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: 'Marketplace item deleted successfully' });
});
