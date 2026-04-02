import { Request, Response } from 'express';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response';
import * as UsersAdminService from './users.admin.service';

export const getUsersList = catchAsync(async (req: Request, res: Response) => {
  try {
    const users = await UsersAdminService.getAllUsers();
    // (res, status, success, message, data)
    return sendResponse(res, 200, true, 'Users retrieved successfully', users);
  } catch (error: any) {
    console.error('Controller Error:', error.message);
    return sendResponse(res, 500, false, error.message || 'Internal Server Error');
  }
});

export const getUser360 = catchAsync(async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const user360Data = await UsersAdminService.getUser360Profile(userId);
    return sendResponse(res, 200, true, 'User 360 profile retrieved successfully', user360Data);
  } catch (error: any) {
    return sendResponse(res, 500, false, error.message || 'Internal Server Error');
  }
});
