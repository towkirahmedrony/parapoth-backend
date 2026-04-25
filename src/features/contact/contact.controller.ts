import { Request, Response } from 'express';
import { contactService, ContactSubmissionError } from './contact.service.js';
import catchAsync from '../../lib/utils/catchAsync.js';
import sendResponse from '../../lib/utils/response.js';

const getClientIp = (req: Request): string => {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0]?.trim() || req.ip || 'unknown';
  }

  if (Array.isArray(forwardedFor) && forwardedFor[0]) {
    return forwardedFor[0].split(',')[0]?.trim() || req.ip || 'unknown';
  }

  return req.ip || req.socket.remoteAddress || 'unknown';
};

export const submitContactForm = catchAsync(async (req: Request, res: Response) => {
  try {
    const result = await contactService.submitToGoogle(req.body, {
      ip: getClientIp(req),
      userAgent: req.get('user-agent'),
    });

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Message sent successfully',
      data: result,
    });
  } catch (error) {
    if (error instanceof ContactSubmissionError) {
      sendResponse(res, {
        statusCode: error.statusCode,
        success: false,
        message: error.message,
        data: null,
      });
      return;
    }

    throw error;
  }
});
