import type { Request, Response } from 'express';
import type { AssignTrackingBody, CompleteTrackingBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import * as service from './tracking.service.js';

function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value || typeof value !== 'string') throw new AppError(400, 'VALIDATION_ERROR', `Missing ${name} parameter`);
  return value;
}

function requireUser(req: Request) {
  if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return req.user;
}

export async function assign(req: Request, res: Response): Promise<void> {
  const body = req.body as AssignTrackingBody;
  res.status(201).json(await service.assign(requireParam(req, 'id'), body.maintenanceStandardId));
}

export async function listForVehicle(req: Request, res: Response): Promise<void> {
  res.json(await service.listForVehicle(requireParam(req, 'id')));
}

export async function complete(req: Request, res: Response): Promise<void> {
  res.json(await service.complete(requireParam(req, 'id'), requireUser(req).id, req.body as CompleteTrackingBody));
}
