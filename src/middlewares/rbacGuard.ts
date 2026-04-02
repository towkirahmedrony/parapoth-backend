import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import sendResponse from '../lib/utils/response';

interface AuthReq extends Request {
  user?: {
    id: string;
  };
}

export const rbacGuard = (allowedRoles: string[]) => {
  return async (req: AuthReq, res: Response, next: NextFunction) => {
    try {
      if (!req.user || !req.user.id) {
        return sendResponse(res, { statusCode: 401, success: false, message: 'Unauthorized: User not found in request' });
      }

      const userId = req.user.id;

      // Fetch the active role of the user from the user_roles table
      const { data: userRole, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

      // Database error handling with specific log
      if (error) {
        console.error('[RBAC Guard] Supabase DB Error:', error.message || error);
        return sendResponse(res, { statusCode: 500, success: false, message: 'Internal Server Error: Database query failed' });
      }

      // Role not found checking
      if (!userRole || !userRole.role) {
        console.warn(`[RBAC Guard] No active role found for user ID: ${userId}`);
        return sendResponse(res, { statusCode: 403, success: false, message: 'Forbidden: Insufficient permissions or role not found' });
      }

      // Check if the user's role is in the list of allowed roles
      if (!allowedRoles.includes(userRole.role)) {
        console.warn(`[RBAC Guard] Access denied. Expected one of [${allowedRoles.join(', ')}], but got '${userRole.role}'`);
        return sendResponse(res, { statusCode: 403, success: false, message: `Forbidden: Access restricted for role '${userRole.role}'` });
      }

      // If authorized, proceed to the next middleware/controller
      next();
    } catch (error) {
      console.error('[RBAC Guard] Internal Server Error:', error);
      return sendResponse(res, { statusCode: 500, success: false, message: 'Internal Server Error during role verification' });
    }
  };
};

export default rbacGuard;
