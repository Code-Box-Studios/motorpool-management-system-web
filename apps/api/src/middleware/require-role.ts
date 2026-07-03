import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';

// Role gate: mount AFTER requireAuth. 403 when the caller's role isn't allowed.
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError(403, 'FORBIDDEN', 'Insufficient role'));
      return;
    }
    next();
  };
}
