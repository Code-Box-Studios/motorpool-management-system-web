import type { Request, Response } from 'express';
import type {
  CreateBranchBody,
  CreateEmployeeBody,
  CreateOfficeBody,
  CreateOfficeHeadBody,
  UpdateBranchBody,
  UpdateEmployeeBody,
  UpdateOfficeBody,
  UpdateOfficeHeadBody
} from '@mms/shared';
import {
  employeesListQuerySchema,
  organizationListQuerySchema
} from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import * as service from './service.js';

// Express 5: req.query is read-only — parse here, never in middleware.
function listQuery(req: Request) {
  return organizationListQuerySchema.parse(req.query);
}

function requireIdParam(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !id)
    throw new AppError(400, 'VALIDATION_ERROR', 'Missing id parameter');
  return id;
}

export async function listBranches(req: Request, res: Response): Promise<void> {
  res.json(await service.listBranches(listQuery(req)));
}

export async function createBranch(req: Request, res: Response): Promise<void> {
  res
    .status(201)
    .json(await service.createBranch(req.body as CreateBranchBody));
}

export async function updateBranch(req: Request, res: Response): Promise<void> {
  res.json(
    await service.updateBranch(
      requireIdParam(req),
      req.body as UpdateBranchBody
    )
  );
}

export async function archiveBranch(
  req: Request,
  res: Response
): Promise<void> {
  res.json(await service.archiveBranch(requireIdParam(req)));
}

export async function restoreBranch(
  req: Request,
  res: Response
): Promise<void> {
  res.json(await service.restoreBranch(requireIdParam(req)));
}

export async function listOffices(req: Request, res: Response): Promise<void> {
  res.json(await service.listOffices(listQuery(req)));
}

export async function createOffice(req: Request, res: Response): Promise<void> {
  res
    .status(201)
    .json(await service.createOffice(req.body as CreateOfficeBody));
}

export async function updateOffice(req: Request, res: Response): Promise<void> {
  res.json(
    await service.updateOffice(
      requireIdParam(req),
      req.body as UpdateOfficeBody
    )
  );
}

export async function archiveOffice(
  req: Request,
  res: Response
): Promise<void> {
  res.json(await service.archiveOffice(requireIdParam(req)));
}

export async function restoreOffice(
  req: Request,
  res: Response
): Promise<void> {
  res.json(await service.restoreOffice(requireIdParam(req)));
}

export async function listOfficeHeads(
  req: Request,
  res: Response
): Promise<void> {
  res.json(await service.listOfficeHeads(listQuery(req)));
}

export async function createOfficeHead(
  req: Request,
  res: Response
): Promise<void> {
  res
    .status(201)
    .json(await service.createOfficeHead(req.body as CreateOfficeHeadBody));
}

export async function updateOfficeHead(
  req: Request,
  res: Response
): Promise<void> {
  res.json(
    await service.updateOfficeHead(
      requireIdParam(req),
      req.body as UpdateOfficeHeadBody
    )
  );
}

export async function archiveOfficeHead(
  req: Request,
  res: Response
): Promise<void> {
  res.json(await service.archiveOfficeHead(requireIdParam(req)));
}

export async function restoreOfficeHead(
  req: Request,
  res: Response
): Promise<void> {
  res.json(await service.restoreOfficeHead(requireIdParam(req)));
}

export async function listEmployees(
  req: Request,
  res: Response
): Promise<void> {
  // NOT listQuery(): zod strips unknown keys, so the shared schema would drop
  // ?branchId= silently and hand the guide picker every branch's roster.
  res.json(
    await service.listEmployees(employeesListQuerySchema.parse(req.query))
  );
}

export async function createEmployee(
  req: Request,
  res: Response
): Promise<void> {
  res
    .status(201)
    .json(await service.createEmployee(req.body as CreateEmployeeBody));
}

export async function updateEmployee(
  req: Request,
  res: Response
): Promise<void> {
  res.json(
    await service.updateEmployee(
      requireIdParam(req),
      req.body as UpdateEmployeeBody
    )
  );
}

export async function archiveEmployee(
  req: Request,
  res: Response
): Promise<void> {
  res.json(await service.archiveEmployee(requireIdParam(req)));
}

export async function restoreEmployee(
  req: Request,
  res: Response
): Promise<void> {
  res.json(await service.restoreEmployee(requireIdParam(req)));
}
