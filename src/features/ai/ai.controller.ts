import { Request, Response } from 'express';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response';
import { 
  syncVectorEmbeddingsService, 
  chatWithAiService, 
  explainQuestionWithAiService,
  getAiConfigService, 
  updateAiConfigService 
} from './ai.service';

export const getAiConfig = catchAsync(async (req: Request, res: Response) => {
  const result = await getAiConfigService();
  sendResponse(res, 200, true, 'AI config fetched', result);
});

export const updateAiConfig = catchAsync(async (req: Request, res: Response) => {
  const result = await updateAiConfigService(req.body);
  sendResponse(res, 200, true, 'AI config updated', result);
});

export const syncVectorIndex = catchAsync(async (req: Request, res: Response) => {
  const result = await syncVectorEmbeddingsService();
  sendResponse(res, 200, true, 'Vector sync completed', result);
});

export const chatWithAI = catchAsync(async (req: Request, res: Response) => {
  const { message, sessionId, subjectId, lang } = req.body;
  const userId = (req as any).user.id;
  
  if (!subjectId) {
    return sendResponse(res, 400, false, 'Subject selection is required');
  }

  const result = await chatWithAiService(userId, sessionId, message, subjectId, lang);
  sendResponse(res, 200, true, 'AI response generated', result);
});

export const explainQuestion = catchAsync(async (req: Request, res: Response) => {
  const { question, lang } = req.body;
  const result = await explainQuestionWithAiService((req as any).user.id, question, lang);
  sendResponse(res, 200, true, 'AI explanation generated', result);
});
