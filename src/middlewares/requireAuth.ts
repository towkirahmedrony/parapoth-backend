import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import sendResponse from '../lib/utils/response';
import jwt from 'jsonwebtoken';

export interface AuthReq extends Request {
  user?: {
    id: string;
  };
  accessToken?: string;
  authSessionId?: string;
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

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('account_status')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      return sendResponse(res, { statusCode: 503, success: false, message: 'Account status could not be verified' });
    }

    if (!profile || profile.account_status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Account access is unavailable',
        data: null,
        code: 'ACCOUNT_SUSPENDED',
      });
    }

    req.user = { id: user.id };
    // Retain only in request memory so privileged RPCs can verify auth.uid()
    // independently in Postgres. Never persist or log this token.
    req.accessToken = token;
    const claims = jwt.decode(token);
    req.authSessionId = claims && typeof claims === 'object' && typeof claims.session_id === 'string'
      ? claims.session_id
      : undefined;
    
    next();
  } catch {
    console.error('Authentication verification failed');
    return sendResponse(res, { statusCode: 500, success: false, message: 'Internal Server Error during authentication' });
  }
};
