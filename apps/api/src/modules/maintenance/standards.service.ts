import { Prisma } from '@prisma/client';
import type {
  CreateScheduleItemBody,
  CreateStandardBody,
  PaginationQuery,
  UpdateStandardBody
} from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { findStandardById, listStandards } from './standards.repository.js';

export async function list(query: PaginationQuery) {
  return listStandards(toSkipTake(query));
}

export async function getById(id: string) {
  const std = await findStandardById(id);
  if (!std) throw new AppError(404, 'NOT_FOUND', 'Maintenance standard not found');
  return std;
}

export async function create(body: CreateStandardBody) {
  const { scheduleItems, ...rest } = body;
  return prisma.maintenanceStandard.create({
    data: { ...rest, ...(scheduleItems ? { scheduleItems: { create: scheduleItems } } : {}) },
    include: { scheduleItems: true }
  });
}

export async function update(id: string, body: UpdateStandardBody) {
  await getById(id);
  return prisma.maintenanceStandard.update({
    where: { id },
    data: body,
    include: { scheduleItems: true }
  });
}

export async function remove(id: string): Promise<void> {
  await getById(id);
  try {
    await prisma.maintenanceStandard.delete({ where: { id } });
  } catch (err) {
    // Items cascade-delete, but an item still referenced by a tracking row
    // (RESTRICT) blocks the whole delete.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new AppError(409, 'STANDARD_IN_USE', 'Standard has schedule items still tracked on a vehicle');
    }
    throw err;
  }
}

export async function addScheduleItem(standardId: string, body: CreateScheduleItemBody) {
  await getById(standardId);
  return prisma.maintenanceScheduleItem.create({ data: { ...body, maintenanceStandardId: standardId } });
}

export async function removeScheduleItem(itemId: string): Promise<void> {
  const item = await prisma.maintenanceScheduleItem.findUnique({ where: { id: itemId } });
  if (!item) throw new AppError(404, 'NOT_FOUND', 'Schedule item not found');
  try {
    await prisma.maintenanceScheduleItem.delete({ where: { id: itemId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new AppError(409, 'SCHEDULE_ITEM_IN_USE', 'Schedule item is tracked on a vehicle');
    }
    throw err;
  }
}
