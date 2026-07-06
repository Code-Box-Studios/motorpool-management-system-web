import type { Prisma } from '@prisma/client';
import type { CreateJobOrderBody, JobOrdersListQuery, UpdateJobOrderBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';
import { findDriverByUserId } from '../drivers/repository.js';
import { findJobOrderById, jobOrderInclude, listJobOrders } from './repository.js';

// Visibility (spec §6): admin/evp see all; everyone else sees rows they
// requested OR that are assigned to their driver row (via drivers.userId).
async function scopeFor(actor: AuthenticatedUser): Promise<Prisma.JobOrderWhereInput> {
  if (actor.role === 'admin' || actor.role === 'evp_operations') return {};
  const driver = await findDriverByUserId(actor.id);
  const or: Prisma.JobOrderWhereInput[] = [{ requestedById: actor.id }];
  if (driver) or.push({ assignedMechanicId: driver.id });
  return { OR: or };
}

export async function list(query: JobOrdersListQuery, actor: AuthenticatedUser) {
  const scope = await scopeFor(actor);
  const where: Prisma.JobOrderWhereInput = { ...scope, ...(query.status ? { status: query.status } : {}) };
  return listJobOrders(where, toSkipTake(query));
}

export async function getById(id: string, actor: AuthenticatedUser) {
  const order = await findJobOrderById(id);
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Job order not found');
  if (actor.role !== 'admin' && actor.role !== 'evp_operations') {
    const driver = await findDriverByUserId(actor.id);
    const mine = order.requestedById === actor.id || (driver !== null && order.assignedMechanicId === driver.id);
    if (!mine) throw new AppError(404, 'NOT_FOUND', 'Job order not found'); // not-found masking
  }
  return order;
}

export async function create(body: CreateJobOrderBody) {
  return prisma.jobOrder.create({ data: { ...body, status: 'pending' }, include: jobOrderInclude });
}

export async function update(id: string, body: UpdateJobOrderBody) {
  const existing = await findJobOrderById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Job order not found');
  if (existing.status !== 'pending') {
    throw new AppError(409, 'INVALID_TRANSITION', 'Job order can only be edited while pending');
  }
  await prisma.jobOrder.update({ where: { id }, data: body });
  return findJobOrderById(id);
}

export async function remove(id: string): Promise<void> {
  const existing = await findJobOrderById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Job order not found');
  await prisma.jobOrder.delete({ where: { id } }); // job_order_spare_parts cascade (schema)
}
