import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import sendResponse from '../lib/utils/response';
import { isCanonicalRole, roleCanAccessRoute } from './authorization';
import { createUserSupabaseClient } from '../config/userSupabase';

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

      // 🚀 আপডেট: .single() এর বদলে limit(1).maybeSingle() দেওয়া হলো যাতে একাধিক রো থাকলেও ক্র্যাশ না করে
      const { data: userRole, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false }) // একাধিক রোল থাকলে লেটেস্ট রোলটি নেবে
        .limit(1)
        .maybeSingle();

      // Database error handling with specific log
      if (error) {
        console.error('[RBAC Guard] Supabase DB Error:', error.message || error);
        return sendResponse(res, { statusCode: 500, success: false, message: 'Internal Server Error: Database query failed' });
      }

      // Role not found checking
      if (!userRole || !userRole.role) {
        console.warn('[RBAC Guard] No active role found');
        return sendResponse(res, { statusCode: 403, success: false, message: 'Forbidden: Insufficient permissions or role not found' });
      }

      if (!isCanonicalRole(userRole.role)) {
        console.error('[RBAC Guard] Unsupported role value; denying access');
        return sendResponse(res, { statusCode: 403, success: false, message: 'Forbidden: Unsupported role' });
      }

      // Check if the user's role is in the list of allowed roles
      if (!roleCanAccessRoute(userRole.role, allowedRoles)) {
        console.warn('[RBAC Guard] Role not authorized for this route');
        return sendResponse(res, { statusCode: 403, success: false, message: 'Forbidden: Insufficient permissions' });
      }

      // Attach the verified role so downstream handlers can make
      // role-dependent decisions (for example the question review workflow)
      // without trusting a role supplied by the client.
      req.userRole = userRole.role;

      if (userRole.role !== 'student') {
        const { data: profile, error: profileError } = await supabase
          .from('profiles').select('account_status').eq('id', userId).maybeSingle();
        if (profileError) {
          console.error('[RBAC Guard] Account status verification unavailable');
          return sendResponse(res, { statusCode: 503, success: false, message: 'Authorization unavailable' });
        }
        if (!profile || profile.account_status !== 'active') {
          return sendResponse(res, { statusCode: 403, success: false, message: 'Forbidden: Account unavailable' });
        }
      }

      if (userRole.role === 'admin' || userRole.role === 'super_admin') {
        if (!req.authSessionId || !req.accessToken) {
          return sendResponse(res, { statusCode: 401, success: false, message: 'Unauthorized: Session unavailable' });
        }
        const sessions = (supabase as any).from('admin_auth_sessions');
        let { data: appSession, error: sessionError } = await sessions
          .select('id,user_id,revoked_at').eq('auth_session_id', req.authSessionId).maybeSingle();
        if (sessionError) {
          console.error('[RBAC Guard] Session verification unavailable');
          return sendResponse(res, { statusCode: 503, success: false, message: 'Authorization unavailable' });
        }
        if (!appSession) {
          const { error: registerError } = await createUserSupabaseClient(req.accessToken).rpc('register_admin_auth_session');
          if (registerError) {
            console.error('[RBAC Guard] Session registration failed');
            return sendResponse(res, { statusCode: 503, success: false, message: 'Authorization unavailable' });
          }
          const result = await sessions.select('id,user_id,revoked_at')
            .eq('auth_session_id', req.authSessionId).maybeSingle();
          appSession = result.data;
          sessionError = result.error;
        }
        if (sessionError || !appSession || appSession.user_id !== userId || appSession.revoked_at) {
          return sendResponse(res, { statusCode: 401, success: false, message: 'Unauthorized: Session revoked or invalid' });
        }
      }

      // If authorized, proceed to the next middleware/controller
      next();
    } catch {
      console.error('[RBAC Guard] Authorization verification failed');
      return sendResponse(res, { statusCode: 503, success: false, message: 'Authorization unavailable' });
    }
  };
};

export default rbacGuard;
