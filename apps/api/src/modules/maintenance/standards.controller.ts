import type { Request, Response } from 'express';
import type { CreateScheduleItemBody, CreateStandardBody, UpdateStandardBody } from '@mms/shared';
import { paginationQuerySchema } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import * as service from './standards.service.js';

function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value || typeof value !== 'string') throw new AppError(400, 'VALIDATION_ERROR', `Missing ${name} parameter`);
  return value;
}

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.list(paginationQuerySchema.parse(req.query)));
}

export async function getById(req: Request, res: Response): Promise<void> {
  res.json(await service.getById(requireParam(req, 'id')));
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.create(req.body as CreateStandardBody));
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json(await service.update(requireParam(req, 'id'), req.body as UpdateStandardBody));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(requireParam(req, 'id'));
  res.status(204).end();
}

export async function addScheduleItem(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.addScheduleItem(requireParam(req, 'id'), req.body as CreateScheduleItemBody));
}

export async function removeScheduleItem(req: Request, res: Response): Promise<void> {
  await service.removeScheduleItem(requireParam(req, 'itemId'));
  res.status(204).end();
}
