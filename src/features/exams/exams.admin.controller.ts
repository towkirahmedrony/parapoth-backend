import { Request, Response } from 'express';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response';
import { ExamAdminService } from './exams.admin.service';

export const getAllExams = catchAsync(async (req: Request, res: Response) => {
  const result = await ExamAdminService.getAllExams();
  sendResponse(res, { statusCode: 200, success: true, data: result });
});

export const getExamDetails = catchAsync(async (req: Request, res: Response) => {
  const result = await ExamAdminService.getExamDetails(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, data: result });
});

export const deleteExam = catchAsync(async (req: Request, res: Response) => {
  const result = await ExamAdminService.deleteExam(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: 'Exam deleted', data: result });
});

export const togglePublish = catchAsync(async (req: Request, res: Response) => {
  const result = await ExamAdminService.togglePublish(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: 'Status updated', data: result });
});

export const autoFetchQuestions = catchAsync(async (req: Request, res: Response) => {
  const result = await ExamAdminService.autoFetchQuestions(req.body);
  sendResponse(res, { statusCode: 200, success: true, data: result });
});

export const punishUser = catchAsync(async (req: Request, res: Response) => {
  const adminId = (req as any).user?.id;
  const result = await ExamAdminService.punishUser(req.body, adminId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `User punished: ${req.body?.action}`,
    data: result,
  });
});

export const getLiveProgress = catchAsync(async (req: Request, res: Response) => {
  const result = await ExamAdminService.getLiveProgress(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, data: result });
});

export const getLeaderboard = catchAsync(async (req: Request, res: Response) => {
  const result = await ExamAdminService.getLeaderboard(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, data: result });
});

export const recoverSession = catchAsync(async (req: Request, res: Response) => {
  const adminId = (req as any).user?.id;
  const progressId = req.body?.progressId ?? req.body?.progress_id ?? req.params?.id;
  const extendMinutes = req.body?.extend_minutes ?? req.body?.extendMinutes;

  const result = await ExamAdminService.recoverSession(progressId, extendMinutes, adminId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Attempt extended',
    data: result,
  });
});
