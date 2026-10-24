import { NextFunction, Request, Response } from 'express';
import sendResponse from '../lib/utils/response';
import { isCanonicalRole, type Permission } from './authorization';
import { createUserSupabaseClient } from '../config/userSupabase';

/** Requires role-resolution middleware first; permissions are read from role_permissions via has_permission(). */
export const requirePermission = (...permissions: Permission[]) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role = req.userRole;
      if (!req.user?.id || !role || !isCanonicalRole(role)) {
        return sendResponse(res, { statusCode: 403, success: false, message: 'Forbidden' });
      }
      if (permissions.length === 0) {
        return sendResponse(res, { statusCode: 403, success: false, message: 'Forbidden' });
      }
      if (role === 'super_admin') {
        return next();
      }
      if (!req.accessToken) {
        return sendResponse(res, { statusCode: 401, success: false, message: 'Unauthorized' });
      }

      const client = createUserSupabaseClient(req.accessToken);
      const results = await Promise.all(permissions.map((permission) =>
        client.rpc('has_permission', { p_action: permission }),
      ));
      if (results.some((result) => result.error)) {
        console.error('[Permission Guard] Permission lookup unavailable');
        return sendResponse(res, { statusCode: 503, success: false, message: 'Authorization unavailable' });
      }
      if (results.some((result) => result.data !== true)) {
        return sendResponse(res, { statusCode: 403, success: false, message: 'Forbidden' });
      }
      return next();
    } catch {
      console.error('[Permission Guard] Permission lookup failed');
      return sendResponse(res, { statusCode: 503, success: false, message: 'Authorization unavailable' });
    }
  };
