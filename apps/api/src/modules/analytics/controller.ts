import type { Request, Response } from 'express';
import {
  associationRulesQuerySchema,
  sparePartsModelQuerySchema
} from '@mms/shared';
import * as service from './service.js';

export async function dashboard(_req: Request, res: Response): Promise<void> {
  res.json(await service.dashboard());
}

export async function predictiveMaintenance(
  _req: Request,
  res: Response
): Promise<void> {
  res.json(await service.predictiveMaintenance(new Date()));
}

export async function associationRules(
  req: Request,
  res: Response
): Promise<void> {
  res.json(
    await service.associationRules(associationRulesQuerySchema.parse(req.query))
  );
}

export function associationModel(req: Request, res: Response): void {
  const { algorithm } = sparePartsModelQuerySchema.parse(req.query);
  res.json(service.associationModel(algorithm));
}
