import { Request, Response } from 'express';
import * as contentService from './content.service';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response';
import { AuditFilterParams } from './content.types';

interface AuthReq extends Request { user?: { id: string } }

export const getTaxonomySubjects = catchAsync(async (req: Request, res: Response) => {
  const subjects = await contentService.getSubjects();
  sendResponse(res, { statusCode: 200, success: true, message: 'Subjects retrieved', data: subjects });
});

export const getTaxonomyChapters = catchAsync(async (req: Request, res: Response) => {
  const chapters = await contentService.getChapters(req.query.subjectId as string);
  sendResponse(res, { statusCode: 200, success: true, message: 'Chapters retrieved', data: chapters });
});

export const getTaxonomyTopics = catchAsync(async (req: Request, res: Response) => {
  const topics = await contentService.getTopics(req.query.chapterId as string);
  sendResponse(res, { statusCode: 200, success: true, message: 'Topics retrieved', data: topics });
});

export const getCurriculumTree = catchAsync(async (req: Request, res: Response) => {
  const tree = await contentService.buildCurriculumTree();
  sendResponse(res, { statusCode: 200, success: true, message: 'Curriculum tree retrieved', data: tree });
});

export const manageCurriculum = catchAsync(async (req: Request, res: Response) => {
  const { action, nodeType, data, id } = req.body;
  const result = await contentService.manageCurriculumNode(action, nodeType, data, id);
  sendResponse(res, { statusCode: 200, success: true, message: `Curriculum node ${action}d successfully`, data: result });
});

export const createComprehension = catchAsync(async (req: Request, res: Response) => {
  const result = await contentService.createComprehension(req.body);
  sendResponse(res, { statusCode: 201, success: true, message: 'Comprehension created', data: result });
});

export const searchComprehensions = catchAsync(async (req: Request, res: Response) => {
  const result = await contentService.searchComprehensions(req.query.q as string);
  sendResponse(res, { statusCode: 200, success: true, message: 'Comprehensions retrieved', data: result });
});

export const createQuestion = catchAsync(async (req: AuthReq, res: Response) => {
  const newQuestion = await contentService.saveSmartQuestion({ ...req.body, created_by: req.user?.id });
  sendResponse(res, { statusCode: 201, success: true, message: 'Question saved', data: newQuestion });
});

export const bulkCreateQuestions = catchAsync(async (req: AuthReq, res: Response) => {
  const { questions } = req.body;
  
  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return sendResponse(res, { statusCode: 400, success: false, message: 'Invalid payload: Questions array is required' });
  }

  const result = await contentService.saveBulkQuestions(questions, req.user?.id);
  sendResponse(res, { statusCode: 201, success: true, message: `${result.length} questions uploaded successfully`, data: result });
});

export const updateQuestion = catchAsync(async (req: Request, res: Response) => {
  const result = await contentService.updateQuestion(req.params.id, req.body);
  sendResponse(res, { statusCode: 200, success: true, message: 'Question updated', data: result });
});

export const deleteQuestion = catchAsync(async (req: Request, res: Response) => {
  await contentService.deleteQuestion(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: 'Question soft deleted successfully' });
});

export const getAiReviewQueue = catchAsync(async (req: Request, res: Response) => {
  const queue = await contentService.fetchAiQueue();
  sendResponse(res, { statusCode: 200, success: true, message: 'AI review queue fetched', data: queue });
});

export const reviewQuestion = catchAsync(async (req: AuthReq, res: Response) => {
  const result = await contentService.reviewQuestion(req.params.id, req.body.status, req.user?.id!);
  sendResponse(res, { statusCode: 200, success: true, message: `Question marked as ${req.body.status}`, data: result });
});

export const syncSearchIndex = catchAsync(async (req: Request, res: Response) => {
  const { type } = req.body;
  if (!['vector', 'global'].includes(type)) {
    return sendResponse(res, { statusCode: 400, success: false, message: 'Invalid sync type provided' });
  }
  await contentService.refreshSearchIndex(type);
  sendResponse(res, { statusCode: 200, success: true, message: `${type} search index refresh initiated` });
});

export const getQuestionsForAudit = catchAsync(async (req: Request, res: Response) => {
    const filters: AuditFilterParams = {
        status: req.query.status as string,
        difficulty: req.query.difficulty as string,
        subject_id: req.query.subject_id as string,
        search: req.query.search as string
    };

    const questions = await contentService.getAuditQuestions(filters);
    sendResponse(res, { statusCode: 200, success: true, message: 'Audit queue fetched', data: questions });
});

export const updateAuditQuestionStatus = catchAsync(async (req: AuthReq, res: Response) => {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!['approved', 'rejected', 'flagged'].includes(status)) {
        return sendResponse(res, { statusCode: 400, success: false, message: 'Invalid status for audit update' });
    }

    const result = await contentService.updateQuestionAuditStatus(id, status, notes, req.user?.id!);
    sendResponse(res, { statusCode: 200, success: true, message: `Question audit status updated to ${status}`, data: result });
});

export const getQuestionsBank = catchAsync(async (req: Request, res: Response) => {
  // Extract pagination and filters
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  
  const filters = {
    subject_id: req.query.subject_id as string,
    difficulty: req.query.difficulty as string,
    type: req.query.type as string,
    status: req.query.status as string,
    search: req.query.search as string,
  };

  const { data, total } = await contentService.getFilteredQuestions(filters, page, limit);
  sendResponse(res, { statusCode: 200, success: true, message: 'Question bank fetched', data: { questions: data, total, page, limit } });
});

export const hardDeleteQuestion = catchAsync(async (req: Request, res: Response) => {
  await contentService.hardDeleteQuestion(req.params.id);
  sendResponse(res, { statusCode: 200, success: true, message: 'Question permanently deleted' });
});
