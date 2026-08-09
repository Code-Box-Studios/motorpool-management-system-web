import { Prisma } from '@prisma/client';
import type { CreateVehicleBody, UpdateVehicleBody, VehiclesListQuery } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { toOrderBy } from '../../lib/sorting.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';
import { findVehicleById, listVehicles } from './repository.js';
import { changeVehicleStatus } from './status.js';

export async function list(query: VehiclesListQuery) {
  // The Vehicle column shows "make model year", so sorting it orders by make
  // with model as the tiebreak; `branch` sorts on the related branch's name.
  const orderBy = toOrderBy<
    Prisma.VehicleOrderByWithRelationInput | Prisma.VehicleOrderByWithRelationInput[]
  >(
    query.sortBy,
    query.sortOrder,
    {
      make: (order) => [{ make: order }, { model: order }],
      licensePlate: (order) => ({ licensePlate: order }),
      status: (order) => ({ status: order }),
      mileage: (order) => ({ mileage: order }),
      fuelType: (order) => ({ fuelType: order }),
      capacity: (order) => ({ capacity: order }),
      branch: (order) => ({ branch: { name: order } })
    },
    [{ updatedAt: 'desc' }]
  );
  return listVehicles(toSkipTake(query), orderBy);
}

export async function getById(id: string) {
  const vehicle = await findVehicleById(id);
  if (!vehicle) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');
  return vehicle;
}

// New vehicles are created directly (creation is not a status "change", so no
// audit row — spec §4.2).
export async function create(body: CreateVehicleBody, imagePaths: string[]) {
  return prisma.vehicle.create({ data: { ...body, images: imagePaths } });
}

export async function update(
  id: string,
  body: UpdateVehicleBody,
  newImagePaths: string[],
  actor: AuthenticatedUser
) {
  const existing = await findVehicleById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');

  // Image merge (spec §9 / recon): keep existing paths not in removedImages,
  // then append the newly uploaded ones. Orphaned files are accepted in v1.
  const removed = normalizeRemoved(body.removedImages);
  const mergedImages =
    newImagePaths.length > 0 || removed.length > 0
      ? [...existing.images.filter((url) => !removed.includes(url)), ...newImagePaths]
      : undefined;

  // Never write status through vehicle.update — route it through the audit
  // choke point so the change is recorded.
  const { status, removedImages: _removed, ...rest } = body;

  return prisma.$transaction(async (tx) => {
    if (status !== undefined && status !== existing.status) {
      await changeVehicleStatus(tx, id, status, { changedBy: actor.id, source: 'manual_edit' });
    }
    return tx.vehicle.update({
      where: { id },
      data: { ...rest, ...(mergedImages ? { images: mergedImages } : {}) }
    });
  });
}

export async function remove(id: string): Promise<void> {
  const existing = await findVehicleById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');
  try {
    await prisma.vehicle.delete({ where: { id } });
  } catch (err) {
    // FK RESTRICT from trip tickets, job orders, maintenance, tracking, audit,
    // or GPS rows — surface a domain 409 instead of a generic conflict.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new AppError(409, 'VEHICLE_IN_USE', 'Vehicle is referenced by existing records; set it out of service instead');
    }
    throw err;
  }
}

// removedImages arrives from multipart as string | string[] | undefined.
function normalizeRemoved(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}
