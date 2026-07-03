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

// Get all branches sorted by name.
export async function branches(req: Request, res: Response): Promise<void> {
  res.json(await repo.listBranches(skipTakeFrom(req)));
}

// Get all offices (with embedded head) sorted by name.
export async function offices(req: Request, res: Response): Promise<void> {
  res.json(await repo.listOffices(skipTakeFrom(req)));
}

// Get all office heads sorted by name.
export async function officeHeads(req: Request, res: Response): Promise<void> {
  res.json(await repo.listOfficeHeads(skipTakeFrom(req)));
}
