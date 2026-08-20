import type { Request, Response } from 'express';
import {
  listNotificationsQuerySchema,
  type MarkNotificationsReadBody
} from '@mms/shared';
import { requireUser } from '../../lib/http.js';
import * as service from './service.js';

export async function list(req: Request, res: Response): Promise<void> {
  const query = listNotificationsQuerySchema.parse(req.query);
  res.json(await service.list(requireUser(req).id, query));
}

export async function markRead(req: Request, res: Response): Promise<void> {
  const { ids } = req.body as MarkNotificationsReadBody;
  res.json(await service.markRead(requireUser(req).id, ids));
}

export async function markAllRead(req: Request, res: Response): Promise<void> {
  res.json(await service.markAllRead(requireUser(req).id));
}
