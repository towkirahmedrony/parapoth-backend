import type { Request, Response } from 'express';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response';
import {
  chatWithAiService,
  getAiConfigService,
  syncVectorEmbeddingsService,
  updateAiConfigService,
} from './ai.service';

type AuthenticatedRequest = Request & {
  user?: {
    id?: string;
    role?: string;
  };
};

const getAuthenticatedUserId = (req: Request): string | null => {
  const authReq = req as AuthenticatedRequest;
  return typeof authReq.user?.id === 'string' && authReq.user.id.trim()
    ? authReq.user.id.trim()
    : null;
};

export const getAiConfig = catchAsync(async (_req: Request, res: Response) => {
  const result = await getAiConfigService();
  sendResponse(res, 200, true, 'AI config fetched', result);
});

export const updateAiConfig = catchAsync(async (req: Request, res: Response) => {
  const result = await updateAiConfigService(req.body);
  sendResponse(res, 200, true, 'AI config updated', result);
});

export const syncVectorIndex = catchAsync(async (_req: Request, res: Response) => {
  const result = await syncVectorEmbeddingsService();
  sendResponse(res, 200, true, 'Vector sync completed', result);
});

export const chatWithAI = catchAsync(async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    return sendResponse(res, 401, false, 'Unauthorized');
  }

  const { message, sessionId, subjectId } = req.body as {
    message?: unknown;
    sessionId?: unknown;
    subjectId?: unknown;
  };

  if (typeof message !== 'string' || !message.trim()) {
    return sendResponse(res, 400, false, 'Message is required');
  }

  if (message.trim().length > 1200) {
    return sendResponse(res, 400, false, 'Message must be within 1200 characters');
  }

  if (typeof subjectId !== 'string' || !subjectId.trim()) {
    return sendResponse(res, 400, false, 'Subject selection is required');
  }

  const normalizedSessionId =
    typeof sessionId === 'string' && sessionId.trim().length > 0
      ? sessionId.trim()
      : null;

  const result = await chatWithAiService(
    userId,
    normalizedSessionId,
    message.trim(),
    subjectId.trim()
  );

  sendResponse(res, 200, true, 'AI response generated', result);
});
