import type { Request, Response } from 'express';
import { paginationQuerySchema } from '@mms/shared';
import { toSkipTake } from '../../lib/pagination.js';
import * as repo from './repository.js';

// Express 5: req.query is read-only — parse here, never in middleware.
function skipTakeFrom(req: Request) {
  return toSkipTake(paginationQuerySchema.parse(req.query));
}

// Get all roles sorted by name.
export async function roles(req: Request, res: Response): Promise<void> {
  res.json(await repo.listRoles(skipTakeFrom(req)));
}
