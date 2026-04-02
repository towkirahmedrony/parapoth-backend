import { Request, Response } from 'express';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response';
import { ExamUserService } from './exams.user.service';

export const generateExam = catchAsync(async (req: Request, res: Response) => {
  const result = await ExamUserService.generateExam(req.body);
  sendResponse(res, { statusCode: 200, success: true, message: 'Exam generated', data: result });
});

export const getArena = catchAsync(async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const result = await ExamUserService.getArenaQuestions(limit);
  sendResponse(res, { statusCode: 200, success: true, message: 'Arena questions fetched', data: result });
});

export const submitHistory = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id || req.body.user_id;
  const result = await ExamUserService.submitHistory(userId, req.body);
  sendResponse(res, { statusCode: 200, success: true, message: 'Exam history saved', data: result });
});

export const submitExam = catchAsync(async (req: Request, res: Response) => {
  const payload = { ...req.body, user_id: (req as any).user?.id || req.body.user_id };
  const result = await ExamUserService.submitExamResult(payload);
  sendResponse(res, { statusCode: 200, success: true, message: 'Exam submitted', data: result });
});

// নতুন কন্ট্রোলার: Group Battle তৈরি করার জন্য
export const createGroupBattle = catchAsync(async (req: Request, res: Response) => {
  const challengerId = (req as any).user?.id || req.body.user_id; 
  const { opponentId, ...examData } = req.body;

  if (!opponentId) {
    throw new Error('অপোনেন্টের আইডি প্রয়োজন!');
  }

  const result = await ExamUserService.createGroupBattleExam(challengerId, opponentId, examData);

  sendResponse(res, { 
    statusCode: 201, 
    success: true, 
    message: 'ব্যাটল এক্সাম সফলভাবে তৈরি হয়েছে', 
    data: result 
  });
});
