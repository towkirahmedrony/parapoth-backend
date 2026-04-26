import { Request, Response } from 'express';
import * as contentService from './content.service';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response';
import {
  AUDITABLE_STATUSES,
  AuditFilterParams,
  AuthenticatedUser,
  ComprehensionPayload,
  NodeType,
  QuestionBankFilters,
  QuestionPayload,
  QuestionStatus,
  AuditableStatus,
  SyncIndexPayload,
  InstitutionPayload
} from './content.types';

interface AuthReq extends Request {
  user?: AuthenticatedUser;
}

const NODE_TYPES: NodeType[] = ['subject', 'chapter', 'topic'];
const CURRICULUM_ACTIONS = ['insert', 'update', 'delete'] as const;
type CurriculumAction = (typeof CURRICULUM_ACTIONS)[number];

const parsePositiveInt = (value: unknown, fallback: number, options?: { min?: number; max?: number }): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  const min = options?.min ?? 1;
  const max = options?.max ?? Number.MAX_SAFE_INTEGER;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
};

const requireUserId = (req: AuthReq): string => {
  const userId = req.user?.id;
  if (!userId) throw new Error('Authenticated user not found');
  return userId;
};

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isNodeType = (value: unknown): value is NodeType => typeof value === 'string' && NODE_TYPES.includes(value as NodeType);
const isCurriculumAction = (value: unknown): value is CurriculumAction => typeof value === 'string' && CURRICULUM_ACTIONS.includes(value as CurriculumAction);

export const getTaxonomySubjects = catchAsync(async (_req: Request, res: Response) => {
  const subjects = await contentService.getSubjects();
  sendResponse(res, { statusCode: 200, success: true, message: 'Subjects retrieved', data: subjects });
});

export const getTaxonomyChapters = catchAsync(async (req: Request, res: Response) => {
  const subjectId = isNonEmptyString(req.query.subjectId) ? req.query.subjectId.trim() : undefined;
  const chapters = await contentService.getChapters(subjectId);
  sendResponse(res, { statusCode: 200, success: true, message: 'Chapters retrieved', data: chapters });
});

export const getTaxonomyTopics = catchAsync(async (req: Request, res: Response) => {
  const chapterId = isNonEmptyString(req.query.chapterId) ? req.query.chapterId.trim() : undefined;
  const topics = await contentService.getTopics(chapterId);
  sendResponse(res, { statusCode: 200, success: true, message: 'Topics retrieved', data: topics });
});

export const getCurriculumTree = catchAsync(async (_req: Request, res: Response) => {
  const tree = await contentService.buildCurriculumTree();
  sendResponse(res, { statusCode: 200, success: true, message: 'Curriculum tree retrieved', data: tree });
});

export const manageCurriculum = catchAsync(async (req: Request, res: Response) => {
  const { action, nodeType, data, id } = req.body as { action?: unknown; nodeType?: unknown; data?: unknown; id?: unknown };

  if (!isCurriculumAction(action) || !isNodeType(nodeType)) {
    return sendResponse(res, { statusCode: 400, success: false, message: 'Invalid action or node type' });
  }

  if (action !== 'insert' && !isNonEmptyString(id)) {
    return sendResponse(res, { statusCode: 400, success: false, message: 'ID is required' });
  }

  const result = await contentService.manageCurriculumNode(action, nodeType, (data as Record<string, unknown>) || {}, isNonEmptyString(id) ? id.trim() : undefined);
  sendResponse(res, { statusCode: 200, success: true, message: `Curriculum ${action} successful`, data: result });
});

export const createComprehension = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body as Partial<ComprehensionPayload>;
  if (!isNonEmptyString(payload.body)) {
    return sendResponse(res, { statusCode: 400, success: false, message: 'Body is required' });
  }
  const result = await contentService.createComprehension({
    subject_id: isNonEmptyString(payload.subject_id) ? payload.subject_id.trim() : undefined,
    chapter_id: isNonEmptyString(payload.chapter_id) ? payload.chapter_id.trim() : undefined,
    topic_id: isNonEmptyString(payload.topic_id) ? payload.topic_id.trim() : undefined,
    body: payload.body.trim(),
    media_id: isNonEmptyString(payload.media_id) ? payload.media_id.trim() : undefined,
  });
  sendResponse(res, { statusCode: 201, success: true, message: 'Comprehension created', data: result });
});

export const searchComprehensions = catchAsync(async (req: Request, res: Response) => {
  const query = isNonEmptyString(req.query.q) ? req.query.q.trim() : '';
  if (!query) return sendResponse(res, { statusCode: 400, success: false, message: 'Search query is required' });
  const result = await contentService.searchComprehensions(query);
  sendResponse(res, { statusCode: 200, success: true, message: 'Comprehensions retrieved', data: result });
});

export const createQuestion = catchAsync(async (req: AuthReq, res: Response) => {
  const userId = requireUserId(req);
  const body = req.body as Record<string, unknown>;

  if (!body.subject_id || !body.type || !body.difficulty_level || !body.body || !body.options) {
    return sendResponse(res, { statusCode: 400, success: false, message: 'Missing required question fields' });
  }

  const payload: QuestionPayload = {
    subject_id: String(body.subject_id),
    type: String(body.type),
    difficulty_level: String(body.difficulty_level),
    body: body.body as Record<string, unknown>,
    options: body.options as Record<string, unknown>[],
    chapter_id: body.chapter_id ? String(body.chapter_id) : undefined,
    topic_id: body.topic_id ? String(body.topic_id) : undefined,
    status: (body.status as QuestionStatus) || 'pending',
    created_by: userId,
    explanation: body.explanation ? String(body.explanation) : undefined,
    media_id: body.media_id ? String(body.media_id) : null,
  };

  const newQuestion = await contentService.saveSmartQuestion(payload);
  sendResponse(res, { statusCode: 201, success: true, message: 'Question saved', data: newQuestion });
});

export const bulkCreateQuestions = catchAsync(async (req: AuthReq, res: Response) => {
  const userId = requireUserId(req);
  const questions = (req.body as { questions?: unknown }).questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    return sendResponse(res, { statusCode: 400, success: false, message: 'Invalid questions array' });
  }
  const result = await contentService.saveBulkQuestions(questions as Record<string, unknown>[], userId);
  sendResponse(res, { statusCode: 201, success: true, message: 'Upload successful', data: result });
});

export const updateQuestion = catchAsync(async (req: Request, res: Response) => {
  if (!isNonEmptyString(req.params.id)) return sendResponse(res, { statusCode: 400, success: false, message: 'ID required' });
  const result = await contentService.updateQuestion(req.params.id.trim(), req.body as Partial<QuestionPayload>);
  sendResponse(res, { statusCode: 200, success: true, message: 'Question updated', data: result });
});

export const deleteQuestion = catchAsync(async (req: Request, res: Response) => {
  if (!isNonEmptyString(req.params.id)) return sendResponse(res, { statusCode: 400, success: false, message: 'ID required' });
  await contentService.deleteQuestion(req.params.id.trim());
  sendResponse(res, { statusCode: 200, success: true, message: 'Question soft deleted' });
});

export const getAiReviewQueue = catchAsync(async (_req: Request, res: Response) => {
  const queue = await contentService.fetchAiQueue();
  sendResponse(res, { statusCode: 200, success: true, message: 'AI queue fetched', data: queue });
});

export const reviewQuestion = catchAsync(async (req: AuthReq, res: Response) => {
  const userId = requireUserId(req);
  const status = (req.body as { status?: unknown }).status;
  if (status !== 'approved' && status !== 'rejected') return sendResponse(res, { statusCode: 400, success: false, message: 'Invalid status' });
  const result = await contentService.reviewQuestion(req.params.id.trim(), status, userId);
  sendResponse(res, { statusCode: 200, success: true, message: `Status updated to ${status}`, data: result });
});

export const syncSearchIndex = catchAsync(async (req: Request, res: Response) => {
  const { type } = req.body as Partial<SyncIndexPayload>;
  if (type !== 'vector' && type !== 'global') return sendResponse(res, { statusCode: 400, success: false, message: 'Invalid sync type' });
  await contentService.refreshSearchIndex(type);
  sendResponse(res, { statusCode: 200, success: true, message: 'Index refresh initiated' });
});

export const getQuestionsForAudit = catchAsync(async (req: Request, res: Response) => {
  const filters: AuditFilterParams = {
    status: isNonEmptyString(req.query.status) ? req.query.status.trim() : undefined,
    difficulty: isNonEmptyString(req.query.difficulty) ? req.query.difficulty.trim() : undefined,
    subject_id: isNonEmptyString(req.query.subject_id) ? req.query.subject_id.trim() : undefined,
    search: isNonEmptyString(req.query.search) ? req.query.search.trim() : undefined,
  };
  const questions = await contentService.getAuditQuestions(filters);
  sendResponse(res, { statusCode: 200, success: true, message: 'Audit queue fetched', data: questions });
});

export const updateAuditQuestionStatus = catchAsync(async (req: AuthReq, res: Response) => {
  const userId = requireUserId(req);
  const { status, notes } = req.body as { status?: unknown; notes?: unknown };
  if (typeof status !== 'string' || !AUDITABLE_STATUSES.includes(status as AuditableStatus)) {
    return sendResponse(res, { statusCode: 400, success: false, message: 'Invalid audit status' });
  }
  const result = await contentService.updateQuestionAuditStatus(req.params.id.trim(), status, isNonEmptyString(notes) ? notes.trim() : undefined, userId);
  sendResponse(res, { statusCode: 200, success: true, message: 'Audit status updated', data: result });
});

export const getQuestionsBank = catchAsync(async (req: Request, res: Response) => {
  const page = parsePositiveInt(req.query.page, 1);
  const limit = parsePositiveInt(req.query.limit, 20);
  const filters: QuestionBankFilters = {
    subject_id: isNonEmptyString(req.query.subject_id) ? req.query.subject_id.trim() : undefined,
    difficulty: isNonEmptyString(req.query.difficulty) ? req.query.difficulty.trim() : undefined,
    type: isNonEmptyString(req.query.type) ? req.query.type.trim() : undefined,
    status: isNonEmptyString(req.query.status) ? req.query.status.trim() : undefined,
    search: isNonEmptyString(req.query.search) ? req.query.search.trim() : undefined,
  };
  const { data, total } = await contentService.getFilteredQuestions(filters, page, limit);
  sendResponse(res, { statusCode: 200, success: true, message: 'Bank fetched', data: { questions: data, total, page, limit } });
});

export const hardDeleteQuestion = catchAsync(async (req: Request, res: Response) => {
  if (!isNonEmptyString(req.params.id)) return sendResponse(res, { statusCode: 400, success: false, message: 'ID required' });
  await contentService.hardDeleteQuestion(req.params.id.trim());
  sendResponse(res, { statusCode: 200, success: true, message: 'Permanently deleted' });
});

// 👇 নতুন যুক্ত করা Institution Controllers 👇
export const getInstitutions = catchAsync(async (_req: Request, res: Response) => {
  const data = await contentService.getInstitutions();
  sendResponse(res, { statusCode: 200, success: true, message: 'Institutions retrieved', data });
});

export const createInstitution = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body as Partial<InstitutionPayload>;
  if (!isNonEmptyString(payload.name_bn) || !isNonEmptyString(payload.type)) {
    return sendResponse(res, { statusCode: 400, success: false, message: 'name_bn and type are required' });
  }
  const result = await contentService.createInstitution(payload);
  sendResponse(res, { statusCode: 201, success: true, message: 'Institution created', data: result });
});

export const updateInstitution = catchAsync(async (req: Request, res: Response) => {
  if (!isNonEmptyString(req.params.id)) return sendResponse(res, { statusCode: 400, success: false, message: 'ID required' });
  const result = await contentService.updateInstitution(req.params.id.trim(), req.body as Partial<InstitutionPayload>);
  sendResponse(res, { statusCode: 200, success: true, message: 'Institution updated', data: result });
});

export const deleteInstitution = catchAsync(async (req: Request, res: Response) => {
  if (!isNonEmptyString(req.params.id)) return sendResponse(res, { statusCode: 400, success: false, message: 'ID required' });
  await contentService.deleteInstitution(req.params.id.trim());
  sendResponse(res, { statusCode: 200, success: true, message: 'Institution deleted' });
});
