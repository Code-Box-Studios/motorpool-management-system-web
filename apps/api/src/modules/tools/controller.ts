import type { Request, Response } from 'express';
import type { CreateToolBody, UpdateToolBody } from '@mms/shared';
import { toolsListQuerySchema } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { publicUploadPath } from '../../lib/uploads.js';
import * as service from './service.js';

function requireIdParam(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !id)
    throw new AppError(400, 'VALIDATION_ERROR', 'Missing id parameter');
  return id;
}

function imagePath(req: Request): string | null {
  return req.file ? publicUploadPath('tools', req.file.filename) : null;
}

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.list(toolsListQuerySchema.parse(req.query)));
}

export async function getById(req: Request, res: Response): Promise<void> {
  res.json(await service.getById(requireIdParam(req)));
}

export async function create(req: Request, res: Response): Promise<void> {
  res
    .status(201)
    .json(await service.create(req.body as CreateToolBody, imagePath(req)));
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json(
    await service.update(
      requireIdParam(req),
      req.body as UpdateToolBody,
      imagePath(req)
    )
  );
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(requireIdParam(req));
  res.status(204).end();
}

export async function stats(_req: Request, res: Response): Promise<void> {
  // dueAt is `@db.Date` (always UTC midnight), so comparing it against a full
  // instant makes a tool overdue from 00:00Z on its due date — two hours
  // before local midnight in Malta (UTC+2), while the detail page compares
  // against local calendar-day today and shows no badge until then. Truncate
  // to UTC midnight here so the window's boundary agrees with the column it
  // is compared against, and with the frontend.
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  res.json(await service.stats(today));
}
