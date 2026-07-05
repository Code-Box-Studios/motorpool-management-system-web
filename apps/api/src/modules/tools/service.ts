import type { CreateToolBody, PaginationQuery, UpdateToolBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { findToolById, listTools } from './repository.js';

export async function list(query: PaginationQuery) {
  return listTools(toSkipTake(query));
}

export async function getById(id: string) {
  const tool = await findToolById(id);
  if (!tool) throw new AppError(404, 'NOT_FOUND', 'Tool not found');
  return tool;
}

export async function create(body: CreateToolBody, imagePath: string | null) {
  return prisma.tool.create({ data: { ...body, image: imagePath } });
}

// Permissive passthrough (spec §6): whatever borrow fields the caller sends are
// written verbatim. '' already became null in the contract, so a "return" that
// sends empty borrow fields clears them. No borrow/return invariants enforced.
export async function update(id: string, body: UpdateToolBody, newImagePath: string | null) {
  const existing = await findToolById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Tool not found');
  const { removeImage, ...rest } = body;
  const image = newImagePath ? newImagePath : removeImage ? null : undefined;
  return prisma.tool.update({
    where: { id },
    data: { ...rest, ...(image !== undefined ? { image } : {}) }
  });
}

export async function remove(id: string): Promise<void> {
  const existing = await findToolById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Tool not found');
  await prisma.tool.delete({ where: { id } });
}
