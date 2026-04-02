import { Request, Response } from 'express';
import { z } from 'zod';
import * as communityService from './community.admin.service';
import catchAsync from '../../lib/utils/catchAsync';
import response from '../../lib/utils/response';

// কাস্টম Request ইন্টারফেস (req.user এর টাইপ সেফটির জন্য)
interface AuthRequest extends Request {
  user?: { id: string; role?: string };
}

// Validation Schemas
const moderateActionSchema = z.object({
  messageId: z.string().uuid({ message: "Invalid message ID" }),
  action: z.enum(['warn', 'delete', 'ban'], { required_error: "Action must be warn, delete, or ban" })
});

const autoBanDictSchema = z.object({
  words: z.array(z.string()).default([]),
  autoDelete: z.boolean().default(false)
});

export const getOverview = catchAsync(async (req: Request, res: Response) => {
  const data = await communityService.getGroupsOverview();
  return response(res, { statusCode: 200, success: true, message: 'Community overview fetched successfully', data: data });
});

export const getFlaggedChats = catchAsync(async (req: Request, res: Response) => {
  const flaggedChats = await communityService.getFlaggedChats();
  return response(res, { statusCode: 200, success: true, message: 'Flagged chats fetched successfully', data: flaggedChats });
});

export const moderateAction = catchAsync(async (req: AuthRequest, res: Response) => {
  const validatedData = moderateActionSchema.parse(req.body);
  
  if (!req.user?.id) {
    throw new Error('Unauthorized: User ID is missing');
  }

  const result = await communityService.executeModeration(
    validatedData.messageId, 
    validatedData.action, 
    req.user.id
  );
  return response(res, { statusCode: 200, success: true, message: `Action '${validatedData.action}' executed successfully`, data: result });
});

export const getAutoBanDict = catchAsync(async (req: Request, res: Response) => {
  const settings = await communityService.getAutoBanDictionary();
  return response(res, { statusCode: 200, success: true, message: 'Auto-ban dictionary fetched', data: settings });
});

export const updateAutoBanDict = catchAsync(async (req: Request, res: Response) => {
  const validatedData = autoBanDictSchema.parse(req.body);
  const updatedSettings = await communityService.updateAutoBanDictionary(validatedData);
  return response(res, { statusCode: 200, success: true, message: 'Auto-ban dictionary updated successfully', data: updatedSettings });
});

// =====================================
// NEW: Controllers for LiveChatMonitor
// =====================================
export const getLiveChats = catchAsync(async (req: Request, res: Response) => {
  const groupId = req.query.groupId as string | undefined; // Optional filter
  const data = await communityService.getLiveChats(groupId);
  return response(res, { statusCode: 200, success: true, message: 'Live chats fetched successfully', data: data });
});

export const deleteLiveChatMessage = catchAsync(async (req: AuthRequest, res: Response) => {
  const { messageId } = req.params;

  if (!req.user?.id) {
    throw new Error('Unauthorized: User ID is missing');
  }

  await communityService.deleteLiveChatMessage(messageId, req.user.id);
  return response(res, { statusCode: 200, success: true, message: 'Message deleted directly from live monitor' });
});
