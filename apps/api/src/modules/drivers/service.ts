import type { CreateDriverBody, PaginationQuery, UpdateDriverBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';
import { findDriverByEmail, findDriverById, listDrivers } from './repository.js';

export async function list(query: PaginationQuery, actor: AuthenticatedUser) {
  // Driver-role callers are scoped to their own row (spec §5 matrix).
  const onlyUserId = actor.role === 'driver' ? actor.id : undefined;
  return listDrivers(toSkipTake(query), onlyUserId);
}

export async function getById(id: string, actor: AuthenticatedUser) {
  const driver = await findDriverById(id);
  // Not-found masking: a driver probing someone else's id learns nothing.
  if (!driver || (actor.role === 'driver' && driver.userId !== actor.id)) {
    throw new AppError(404, 'NOT_FOUND', 'Driver not found');
  }
  return driver;
}

// Admin-only paths skip the driver-role scoping.
async function mustExist(id: string) {
  const driver = await findDriverById(id);
  if (!driver) throw new AppError(404, 'NOT_FOUND', 'Driver not found');
  return driver;
}

export async function create(body: CreateDriverBody) {
  if (await findDriverByEmail(body.email)) {
    throw new AppError(409, 'EMAIL_TAKEN', 'A driver with this email already exists');
  }
  return prisma.driver.create({ data: body });
}

export async function update(id: string, body: UpdateDriverBody) {
  await mustExist(id);
  if (body.email) {
    const clash = await findDriverByEmail(body.email);
    if (clash && clash.id !== id) {
      throw new AppError(409, 'EMAIL_TAKEN', 'A driver with this email already exists');
    }
  }
  return prisma.driver.update({ where: { id }, data: body });
}

export async function remove(id: string): Promise<void> {
  await mustExist(id);
  await prisma.driver.delete({ where: { id } });
}
