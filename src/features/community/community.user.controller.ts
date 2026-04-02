import { Request, Response } from 'express';
import { z } from 'zod';
import * as userService from './community.user.service';
import catchAsync from '../../lib/utils/catchAsync';
import response from '../../lib/utils/response';

// কাস্টম Request ইন্টারফেস
interface AuthRequest extends Request {
  user?: { id: string; role?: string };
}

// Zod Schemas for Validation
const startFocusSchema = z.object({
  topic: z.string().min(1, "Study topic is required"),
});

const buzzSchema = z.object({
  targetUserId: z.string().uuid("Invalid target user ID"),
});

export const getLobbyData = catchAsync(async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) throw new Error('Unauthorized');
  
  const data = await userService.getLobbyDashboard(req.user.id);
  return response(res, { statusCode: 200, success: true, message: 'Lobby data fetched successfully', data: data });
});

export const startFocus = catchAsync(async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) throw new Error('Unauthorized');
  const { topic } = startFocusSchema.parse(req.body);
  
  const result = await userService.startFocusSession(req.user.id, topic);
  return response(res, { statusCode: 200, success: true, message: 'Focus session started successfully', data: result });
});

export const challengeTrio = catchAsync(async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) throw new Error('Unauthorized');
  
  const result = await userService.initiateBattle(req.user.id);
  return response(res, { statusCode: 200, success: true, message: 'Battle challenge sent! Waiting for opponents.', data: result });
});

export const buzzUser = catchAsync(async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) throw new Error('Unauthorized');
  const { targetUserId } = buzzSchema.parse(req.body);
  
  await userService.sendBuzz(req.user.id, targetUserId);
  return response(res, { statusCode: 200, success: true, message: 'Buzz sent successfully!' });
});
