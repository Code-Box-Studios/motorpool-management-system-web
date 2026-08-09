import type { CreateMaintenanceBody, UpdateMaintenanceBody, MaintenanceListQuery } from '@mms/shared';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { toOrderBy } from '../../lib/sorting.js';
import { prisma } from '../../lib/prisma.js';
import { findMaintenanceById, listMaintenance } from './repository.js';

export async function list(vehicleId: string | undefined, query: MaintenanceListQuery) {
  const orderBy = toOrderBy<Prisma.MaintenanceOrderByWithRelationInput>(
    query.sortBy,
    query.sortOrder,
    {
      date: (order) => ({ date: order }),
      // The table's Vehicle cell shows make/model — sort by the related make.
      vehicle: (order) => ({ vehicle: { make: order } }),
      type: (order) => ({ type: order }),
      description: (order) => ({ description: order }),
      cost: (order) => ({ cost: order }),
      mileage: (order) => ({ mileage: order }),
      nextDue: (order) => ({ nextDue: order })
    },
    { updatedAt: 'desc' }
  );
  return listMaintenance(vehicleId, toSkipTake(query), orderBy);
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
