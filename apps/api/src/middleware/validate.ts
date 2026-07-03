import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';

// Parses req.body with a Zod schema; the parsed value replaces req.body.
// ZodError flows to the error handler, which maps it to 400 VALIDATION_ERROR.
export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
}
