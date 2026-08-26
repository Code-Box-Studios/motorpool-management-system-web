import type {
  CreateBranchBody,
  OrganizationListQuery,
  UpdateBranchBody
} from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { assertArchivable, branchBlockers } from './guard.js';
import * as repo from './repository.js';

// Case-insensitive, and it spans archived rows on purpose: restoring an
// archived "North Branch" must not collide with one created since, and reusing
// a name would make the archived row ambiguous in historical records.
async function assertBranchNameFree(name: string, excludeId?: string) {
  const clash = await prisma.branch.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(excludeId && { id: { not: excludeId } })
    },
    select: { id: true }
  });
  if (clash)
    throw new AppError(
      409,
      'DUPLICATE_NAME',
      `A branch named "${name}" already exists`
    );
}

async function loadBranch(id: string) {
  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch) throw new AppError(404, 'NOT_FOUND', 'Branch not found');
  return branch;
}

export function listBranches(query: OrganizationListQuery) {
  return repo.listBranches(toSkipTake(query), query.includeArchived);
}

export async function createBranch(body: CreateBranchBody) {
  await assertBranchNameFree(body.name);
  return prisma.branch.create({ data: body });
}

export async function updateBranch(id: string, body: UpdateBranchBody) {
  await loadBranch(id);
  // Exclude the row being updated, or renaming a branch to its own name fails.
  if (body.name !== undefined) await assertBranchNameFree(body.name, id);
  return prisma.branch.update({ where: { id }, data: body });
}

export async function archiveBranch(id: string) {
  const branch = await loadBranch(id);
  if (branch.archivedAt)
    throw new AppError(409, 'ALREADY_ARCHIVED', 'Branch is already archived');
  assertArchivable(branch.name, await branchBlockers(id));
  return prisma.branch.update({
    where: { id },
    data: { archivedAt: new Date() }
  });
}

export async function restoreBranch(id: string) {
  const branch = await loadBranch(id);
  if (!branch.archivedAt)
    throw new AppError(409, 'ALREADY_ARCHIVED', 'Branch is not archived');
  return prisma.branch.update({ where: { id }, data: { archivedAt: null } });
}
