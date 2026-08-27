import type { Request, Response } from 'express';
import { approvalHistoryQuerySchema } from '@mms/shared';
import * as service from './service.js';

export async function history(req: Request, res: Response): Promise<void> {
  res.json(await service.history(approvalHistoryQuerySchema.parse(req.query)));
}
