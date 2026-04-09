import { Request, Response } from 'express';
import catchAsync from '../../lib/utils/catchAsync';
import * as reportsService from './reports.service';

export const submitReport = catchAsync(async (req: Request, res: Response) => {
  // @ts-ignore - Assuming requireAuth middleware attaches user to req
  const userId = req.user?.id || req.user?.sub; 
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized access',
    });
  }

  const reportData = req.body;

  if (!reportData.type || !reportData.report_reason) {
    return res.status(400).json({
      success: false,
      message: 'Type and report_reason are required',
    });
  }

  const report = await reportsService.createReport(userId, reportData);

  return res.status(201).json({
    success: true,
    message: 'Report submitted successfully',
    data: report
  });
});
