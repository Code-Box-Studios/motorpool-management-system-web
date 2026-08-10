import type { Request, Response } from 'express';
import type { CreateSparePartBody, UpdateSparePartBody } from '@mms/shared';
import { sparePartsListQuerySchema } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { publicUploadPath } from '../../lib/uploads.js';
import * as service from './service.js';

function requireIdParam(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !id)
    throw new AppError(400, 'VALIDATION_ERROR', 'Missing id parameter');
  return id;
}

function imagePath(req: Request): string | null {
  return req.file ? publicUploadPath('spare-parts', req.file.filename) : null;
}

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.list(sparePartsListQuerySchema.parse(req.query)));
}

export async function getById(req: Request, res: Response): Promise<void> {
  res.json(await service.getById(requireIdParam(req)));
}

export async function create(req: Request, res: Response): Promise<void> {
  res
    .status(201)
    .json(
      await service.create(req.body as CreateSparePartBody, imagePath(req))
    );
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json(
    await service.update(
      requireIdParam(req),
      req.body as UpdateSparePartBody,
      imagePath(req)
    )
  );
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(requireIdParam(req));
  res.status(204).end();
}
