import type { NextFunction, Request, Response } from 'express';
import { USER_ROLES } from '@mms/shared';
import { AppError } from '../lib/errors.js';

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

// Role gate: mount AFTER requireAuth. 403 when the caller's role isn't allowed.
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }
    if (!roles.some((role) => role === req.user?.role)) {
      next(new AppError(403, 'FORBIDDEN', 'Insufficient role'));
      return;
    }
    next();
  };
}
