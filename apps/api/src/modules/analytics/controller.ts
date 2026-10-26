import type { Request, Response } from 'express';
import {
  associationRulesQuerySchema,
  predictiveMaintenanceQuerySchema,
  sparePartsModelQuerySchema
} from '@mms/shared';
import * as service from './service.js';

export async function dashboard(_req: Request, res: Response): Promise<void> {
  res.json(await service.dashboard());
}

export async function predictiveMaintenance(
  req: Request,
  res: Response
): Promise<void> {
  const { algorithm } = predictiveMaintenanceQuerySchema.parse(req.query);
  res.json(await service.predictiveMaintenance(new Date(), algorithm));
}

export async function associationRules(
  req: Request,
  res: Response
): Promise<void> {
  res.json(
    await service.associationRules(associationRulesQuerySchema.parse(req.query))
  );
}

export async function associationModel(
  req: Request,
  res: Response
): Promise<void> {
  const { algorithm } = sparePartsModelQuerySchema.parse(req.query);
  res.json(await service.associationModel(algorithm));
}
