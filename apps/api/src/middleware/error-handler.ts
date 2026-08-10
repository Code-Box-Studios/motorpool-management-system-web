import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

// Central error mapper: AppError -> its status, Prisma constraint errors -> 409,
// ZodError -> 400, anything else -> 500 with a generic message (spec §12).
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined && { details: err.details })
      }
    });
    return;
  }
  // Catch-all for unique-constraint (P2002) and required-FK (P2003) races that
  // slip past a module's domain pre-checks — surfaced as a generic conflict
  // rather than a 500. Modules that need a more specific code (e.g. users'
  // USER_IN_USE) catch P2003 locally before it reaches this middleware.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002' || err.code === 'P2003') {
      res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: 'The request conflicts with existing data'
        }
      });
      return;
    }
  }
  if (err instanceof multer.MulterError) {
    res.status(400).json({
      error: { code: 'UPLOAD_ERROR', message: err.message }
    });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: err.flatten()
      }
    });
    return;
  }
  req.log?.error(err);
  res
    .status(500)
    .json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
}
