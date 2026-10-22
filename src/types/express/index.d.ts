import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
      };
      /**
       * Role resolved by `rbacGuard` from the `user_roles` table. It is always
       * server-derived; a role supplied in the request body is ignored.
       */
      userRole?: string;
    }
  }
}

export {};
