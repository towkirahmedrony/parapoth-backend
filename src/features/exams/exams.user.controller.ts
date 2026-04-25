import { Request, Response } from 'express';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response';
import { ExamUserService } from './exams.user.service';
import { incrementStreakOnExamSubmit } from '../growth/streak.service';
import { extractIp } from '../../lib/utils/getIp';

export const generateExam = catchAsync(async (req: Request, res: Response) => {
  const result = await ExamUserService.generateExam(req.body);
  sendResponse(res, { statusCode: 200, success: true, message: 'Exam generated', data: result });
});

export const getArena = catchAsync(async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const subjectSlug = req.query.subjectSlug as string | undefined; 
  
  const result = await ExamUserService.getArenaQuestions(limit, subjectSlug);
  sendResponse(res, { statusCode: 200, success: true, message: 'Arena questions fetched', data: result });
});

export const submitHistory = catchAsync(async (req: Request, res: Response) => {
  // 👈 Strict User ID চেক (req.body.user_id বাদ দেওয়া হলো)
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized user' });

  const ipAddress = extractIp(req);
  const userAgent = req.headers['user-agent'] || null;
  const deviceId = (req.headers['x-device-id'] as string) || null;

  const payload = { ...req.body, ip_address: ipAddress, user_agent: userAgent, device_id: deviceId };
  const result = await ExamUserService.submitHistory(userId, payload);
  
  await incrementStreakOnExamSubmit(userId);

  sendResponse(res, { statusCode: 200, success: true, message: 'Exam history saved', data: result });
});

export const submitExam = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized user' });

  const ipAddress = extractIp(req);
  const userAgent = req.headers['user-agent'] || null;
  const deviceId = (req.headers['x-device-id'] as string) || null;

  const payload = { ...req.body, ip_address: ipAddress, user_agent: userAgent, device_id: deviceId };
  const result = await ExamUserService.submitExamResult(userId, payload);

  await incrementStreakOnExamSubmit(userId);

  sendResponse(res, { statusCode: 200, success: true, message: 'Exam submitted', data: result });
});

export const createGroupBattle = catchAsync(async (req: Request, res: Response) => {
  const challengerId = (req as any).user?.id; 
  if (!challengerId) return res.status(401).json({ success: false, message: 'Unauthorized user' });

  const { opponentId, ...examData } = req.body;

  if (!opponentId) {
    throw new Error('অপোনেন্টের আইডি প্রয়োজন!');
  }

  const result = await ExamUserService.createGroupBattleExam(challengerId, opponentId, examData);

  sendResponse(res, { statusCode: 201, success: true, message: 'ব্যাটল এক্সাম সফলভাবে তৈরি হয়েছে', data: result });
});

export const toggleBookmark = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized user' });
  const { questionId } = req.body;

  if (!questionId) {
    throw new Error('Question ID প্রয়োজন!');
  }

  const result = await ExamUserService.toggleBookmark(userId, questionId);

  sendResponse(res, { statusCode: 200, success: true, message: result.message, data: result });
});
