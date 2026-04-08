import { Request, Response } from 'express';
import { contactService } from './contact.service.js';
import catchAsync from '../../lib/utils/catchAsync.js';
import sendResponse from '../../lib/utils/response.js';

export const submitContactForm = catchAsync(async (req: Request, res: Response) => {
  const result = await contactService.submitToGoogle(req.body);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Message sent successfully',
    data: result,
  });
});
