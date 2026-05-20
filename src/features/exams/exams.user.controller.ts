import { Request, Response } from 'express';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response';
import { ExamUserService } from './exams.user.service';
import { incrementStreakOnExamSubmit } from '../growth/streak.service';

// 🛡️ Strict Authorization Helper: রিকোয়েস্ট বডি থেকে ইউজার আইডি নেওয়া সম্পূর্ণ নিষিদ্ধ
const getAuthUserId = (req: Request): string => {
  const userId = (req as any).user?.id;
  if (!userId) {
    throw new Error('Unauthorized: Valid user session required');
  }
  return userId;
};

export const generateExam = catchAsync(async (req: Request, res: Response) => {
  // অথেন্টিকেটেড ইউজারের রিকোয়েস্ট ভেরিফিকেশন
  getAuthUserId(req);
  const result = await ExamUserService.generateExam(req.body);
  sendResponse(res, { statusCode: 200, success: true, message: 'Exam generated successfully', data: result });
});

export const getArena = catchAsync(async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const limit = parseInt(req.query.limit as string) || 10;
  const subjectSlug = req.query.subjectSlug as string | undefined; 
  
  const result = await ExamUserService.getArenaQuestions(userId, limit, subjectSlug);
  sendResponse(res, { statusCode: 200, success: true, message: 'Arena questions fetched', data: result });
});

export const submitHistory = catchAsync(async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const result = await ExamUserService.submitHistory(userId, req.body);
  
  // 🛡️ সিকিউরিটি ফিক্স: প্র্যাকটিস হিস্ট্রি থেকে কোনো স্ট্রিক ইনক্রিমেন্ট হবে না (Abuse প্রতিরোধে)
  sendResponse(res, { statusCode: 200, success: true, message: 'Exam practice history logged', data: result });
});

export const submitExam = catchAsync(async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const payload = { ...req.body, user_id: userId };
  const result = await ExamUserService.submitExamResult(payload);

  // শুধুমাত্র অফিসিয়াল ব্যাকএন্ড ভেরিফাইড সাবমিশনেই স্ট্রিক ইনক্রিমেন্ট হবে
  await incrementStreakOnExamSubmit(userId);

  sendResponse(res, { statusCode: 200, success: true, message: 'Official exam submitted and scored', data: result });
});

export const createGroupBattle = catchAsync(async (req: Request, res: Response) => {
  const challengerId = getAuthUserId(req); 
  const { opponentId, ...examData } = req.body;

  if (!opponentId) {
    throw new Error('Opponent User ID is required to challenge!');
  }

  const result = await ExamUserService.createGroupBattleExam(challengerId, opponentId, examData);

  sendResponse(res, { 
    statusCode: 201, 
    success: true, 
    message: 'Group battle exam created successfully', 
    data: result 
  });
});
