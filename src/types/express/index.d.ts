import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
      };
      /** Verified bearer token kept in request memory only for user-scoped RPCs. */
      accessToken?: string;
      /** Supabase session UUID decoded only after auth.getUser verifies the JWT. */
      authSessionId?: string;
      /**
       * Role resolved by `rbacGuard` from the `user_roles` table. It is always
       * server-derived; a role supplied in the request body is ignored.
       */
      userRole?: string;
    }
  }
}

export {};
