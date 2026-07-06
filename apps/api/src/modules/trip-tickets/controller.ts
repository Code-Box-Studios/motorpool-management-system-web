import type { Request, Response } from 'express';
import type { CreateTripTicketBody, UpdateTripTicketBody } from '@mms/shared';
import { tripTicketsListQuerySchema } from '@mms/shared';
import { requireIdParam, requireUser } from '../../lib/http.js';
import * as service from './service.js';

export async function list(req: Request, res: Response): Promise<void> {
  const query = tripTicketsListQuerySchema.parse(req.query);
  res.json(await service.list(query, requireUser(req)));
}

export async function getById(req: Request, res: Response): Promise<void> {
  res.json(await service.getById(requireIdParam(req), requireUser(req)));
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.create(req.body as CreateTripTicketBody));
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json(await service.update(requireIdParam(req), req.body as UpdateTripTicketBody, requireUser(req)));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(requireIdParam(req));
  res.status(204).end();
}
