import type { Request, Response } from 'express';
import type { CreateMaintenanceBody, UpdateMaintenanceBody } from '@mms/shared';
import { paginationQuerySchema } from '@mms/shared';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import * as service from './service.js';

const listQuerySchema = paginationQuerySchema.extend({ vehicleId: z.string().uuid().optional() });

function requireIdParam(req: Request): string {
  const id = req.params.id;
  if (!id || typeof id !== 'string') throw new AppError(400, 'VALIDATION_ERROR', 'Missing id parameter');
  return id;
}

export async function list(req: Request, res: Response): Promise<void> {
  const q = listQuerySchema.parse(req.query);
  res.json(await service.list(q.vehicleId, q));
}

export async function getById(req: Request, res: Response): Promise<void> {
  res.json(await service.getById(requireIdParam(req)));
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.create(req.body as CreateMaintenanceBody));
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json(await service.update(requireIdParam(req), req.body as UpdateMaintenanceBody));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(requireIdParam(req));
  res.status(204).end();
}
