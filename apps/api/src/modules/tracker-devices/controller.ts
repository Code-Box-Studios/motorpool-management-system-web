import type { Request, Response } from 'express';
import type {
  CreateTrackerDeviceBody,
  UpdateTrackerDeviceBody
} from '@mms/shared';
import {
  resolveDeviceQuerySchema,
  trackerDevicesListQuerySchema
} from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import * as service from './service.js';

function requireIdParam(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !id)
    throw new AppError(400, 'VALIDATION_ERROR', 'Missing id parameter');
  return id;
}

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.list(trackerDevicesListQuerySchema.parse(req.query)));
}

export async function getById(req: Request, res: Response): Promise<void> {
  res.json(await service.getById(requireIdParam(req)));
}

export async function create(req: Request, res: Response): Promise<void> {
  res
    .status(201)
    .json(await service.create(req.body as CreateTrackerDeviceBody));
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json(
    await service.update(
      requireIdParam(req),
      req.body as UpdateTrackerDeviceBody
    )
  );
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(requireIdParam(req));
  res.status(204).end();
}

export async function resolve(req: Request, res: Response): Promise<void> {
  const { deviceId } = resolveDeviceQuerySchema.parse(req.query);
  res.json(await service.resolve(deviceId));
}
