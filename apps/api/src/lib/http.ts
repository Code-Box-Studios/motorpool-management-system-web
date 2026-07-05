import type { Request } from 'express';
import { AppError } from './errors.js';
import type { AuthenticatedUser } from '../middleware/require-auth.js';

// Express 5 types req.params values as string | string[]; narrow to a single
// string. These were duplicated across module controllers — centralized here.
export function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value || typeof value !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', `Missing ${name} parameter`);
  }
  return value;
}

export function requireIdParam(req: Request): string {
  return requireParam(req, 'id');
}

export function requireUser(req: Request): AuthenticatedUser {
  if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return req.user;
}
