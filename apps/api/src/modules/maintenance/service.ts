import type { CreateMaintenanceBody, UpdateMaintenanceBody, PaginationQuery } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { findMaintenanceById, listMaintenance } from './repository.js';

export async function list(vehicleId: string | undefined, query: PaginationQuery) {
  return listMaintenance(vehicleId, toSkipTake(query));
}

export async function getById(id: string) {
  const row = await findMaintenanceById(id);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Maintenance record not found');
  return row;
}

export async function create(body: CreateMaintenanceBody) {
  return prisma.maintenance.create({ data: body });
}

export async function update(id: string, body: UpdateMaintenanceBody) {
  await getById(id);
  return prisma.maintenance.update({ where: { id }, data: body });
}

export async function remove(id: string): Promise<void> {
  await getById(id);
  await prisma.maintenance.delete({ where: { id } });
}
