import type { Request, Response } from 'express';
import type { CreateVehicleBody, UpdateVehicleBody } from '@mms/shared';
import { vehiclesListQuerySchema } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { retainUploadedFiles, uploadedFileUrl } from '../../lib/uploads.js';
import * as service from './service.js';

function requireIdParam(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !id)
    throw new AppError(400, 'VALIDATION_ERROR', 'Missing id parameter');
  return id;
}

function requireUser(req: Request) {
  if (!req.user)
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return req.user;
}

// multer .array() puts uploaded files on req.files (an array here).
function uploadedPaths(req: Request): string[] {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  return files.map((f) => uploadedFileUrl('vehicles', f));
}

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await service.list(vehiclesListQuerySchema.parse(req.query)));
}

export async function getById(req: Request, res: Response): Promise<void> {
  res.json(await service.getById(requireIdParam(req)));
}

export async function create(req: Request, res: Response): Promise<void> {
  const saved = await service.create(
    req.body as CreateVehicleBody,
    uploadedPaths(req)
  );
  retainUploadedFiles(req);
  res.status(201).json(saved);
}

export async function update(req: Request, res: Response): Promise<void> {
  const saved = await service.update(
    requireIdParam(req),
    req.body as UpdateVehicleBody,
    uploadedPaths(req),
    requireUser(req)
  );
  retainUploadedFiles(req);
  res.json(saved);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(requireIdParam(req));
  res.status(204).end();
}
