import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import sendResponse from '../lib/utils/response';

export interface AuthReq extends Request {
  user?: {
    id: string;
  };
}

// export default সরিয়ে export const করা হলো (Named Export)
export const requireAuth = async (req: AuthReq, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendResponse(res, { statusCode: 401, success: false, message: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return sendResponse(res, { statusCode: 401, success: false, message: 'Unauthorized: Invalid or expired token' });
    }

    req.user = { id: user.id };
    
    next();
  } catch (error) {
    console.error('Auth Error:', error);
    return sendResponse(res, { statusCode: 500, success: false, message: 'Internal Server Error during authentication' });
  }
};
