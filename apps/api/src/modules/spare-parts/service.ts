import type { CreateSparePartBody, PaginationQuery, UpdateSparePartBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { findSparePartById, listSpareParts } from './repository.js';

export async function list(query: PaginationQuery) {
  return listSpareParts(toSkipTake(query));
}

export async function getById(id: string) {
  const part = await findSparePartById(id);
  if (!part) throw new AppError(404, 'NOT_FOUND', 'Spare part not found');
  return part;
}

export async function create(body: CreateSparePartBody, imagePath: string | null) {
  return prisma.sparePart.create({ data: { ...body, image: imagePath } });
}

export async function update(id: string, body: UpdateSparePartBody, newImagePath: string | null) {
  const existing = await findSparePartById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Spare part not found');
  const { removeImage, ...rest } = body;
  // Image field: a new upload wins; else removeImage clears it; else untouched.
  const image = newImagePath ? newImagePath : removeImage ? null : undefined;
  return prisma.sparePart.update({
    where: { id },
    data: { ...rest, ...(image !== undefined ? { image } : {}) }
  });
}

export async function remove(id: string): Promise<void> {
  const existing = await findSparePartById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Spare part not found');
  await prisma.sparePart.delete({ where: { id } });
}
