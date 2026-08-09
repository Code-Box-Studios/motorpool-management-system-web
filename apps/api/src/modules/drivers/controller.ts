import type { Request, Response } from 'express';
import type { CreateDriverBody, UpdateDriverBody } from '@mms/shared';
import { driversListQuerySchema } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { publicUploadPath } from '../../lib/uploads.js';
import * as service from './service.js';

function requireIdParam(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !id) throw new AppError(400, 'VALIDATION_ERROR', 'Missing id parameter');
  return id;
}

function photoPath(req: Request): string | null {
  return req.file ? publicUploadPath('drivers', req.file.filename) : null;
}

function requireUser(req: Request) {
  if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return req.user;
}

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.list(driversListQuerySchema.parse(req.query), requireUser(req)));
}

export async function getById(req: Request, res: Response): Promise<void> {
  res.json(await service.getById(requireIdParam(req), requireUser(req)));
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.create(req.body as CreateDriverBody, photoPath(req)));
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json(await service.update(requireIdParam(req), req.body as UpdateDriverBody, photoPath(req)));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(requireIdParam(req));
  res.status(204).end();
}
