import { Request, Response } from 'express';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response';
import { ExamUserService } from './exams.user.service';
import { incrementStreakOnExamSubmit } from '../growth/streak.service';

const getAuthUserId = (req: Request): string => {
  const userId = (req as any).user?.id;

  if (!userId) {
    throw new Error('Unauthorized');
  }

  return userId;
};

export const generateExam = catchAsync(async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const result = await ExamUserService.generateExam(userId, req.body);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Exam generated',
    data: result,
  });
});

export const getArena = catchAsync(async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 10, 1), 100);
  const subjectSlug = req.query.subjectSlug as string | undefined;

  const result = await ExamUserService.getArenaQuestions(userId, limit, subjectSlug);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Arena questions fetched',
    data: result,
  });
});

/**
 * Legacy safe history endpoint.
 * Important:
 * - This endpoint does NOT award XP/streak anymore.
 * - Real scoring must happen through /submit.
 */
export const submitHistory = catchAsync(async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const result = await ExamUserService.submitHistory(userId, req.body);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Exam history saved',
    data: result,
  });
});

export const submitExam = catchAsync(async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const payload = {
    ...req.body,
    user_id: userId,
  };

  const result = await ExamUserService.submitExamResult(payload);

  await incrementStreakOnExamSubmit(userId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Exam submitted',
    data: result,
  });
});

export const createGroupBattle = catchAsync(async (req: Request, res: Response) => {
  const challengerId = getAuthUserId(req);
  const { opponentId, ...examData } = req.body;

  if (!opponentId) {
    throw new Error('অপোনেন্টের আইডি প্রয়োজন!');
  }

  const result = await ExamUserService.createGroupBattleExam(challengerId, opponentId, examData);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'ব্যাটল এক্সাম সফলভাবে তৈরি হয়েছে',
    data: result,
  });
});
