import type { Request, Response } from 'express';
import type { CreateBranchBody, UpdateBranchBody } from '@mms/shared';
import { organizationListQuerySchema } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import * as service from './service.js';

// Express 5: req.query is read-only — parse here, never in middleware.
function listQuery(req: Request) {
  return organizationListQuerySchema.parse(req.query);
}

function requireIdParam(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !id)
    throw new AppError(400, 'VALIDATION_ERROR', 'Missing id parameter');
  return id;
}

export async function listBranches(req: Request, res: Response): Promise<void> {
  res.json(await service.listBranches(listQuery(req)));
}

export async function createBranch(req: Request, res: Response): Promise<void> {
  res
    .status(201)
    .json(await service.createBranch(req.body as CreateBranchBody));
}

export async function updateBranch(req: Request, res: Response): Promise<void> {
  res.json(
    await service.updateBranch(
      requireIdParam(req),
      req.body as UpdateBranchBody
    )
  );
}

export async function archiveBranch(
  req: Request,
  res: Response
): Promise<void> {
  res.json(await service.archiveBranch(requireIdParam(req)));
}

export async function restoreBranch(
  req: Request,
  res: Response
): Promise<void> {
  res.json(await service.restoreBranch(requireIdParam(req)));
}
