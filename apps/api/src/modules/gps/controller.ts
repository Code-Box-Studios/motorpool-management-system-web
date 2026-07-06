import type { Request, Response } from 'express';
import type { IngestGpsBody } from '@mms/shared';
import { gpsHistoryQuerySchema } from '@mms/shared';
import * as service from './service.js';

export async function ingest(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.ingest(req.body as IngestGpsBody));
}

export async function latest(_req: Request, res: Response): Promise<void> {
  res.json(await service.latest());
}

export async function history(req: Request, res: Response): Promise<void> {
  res.json(await service.history(gpsHistoryQuerySchema.parse(req.query)));
}
