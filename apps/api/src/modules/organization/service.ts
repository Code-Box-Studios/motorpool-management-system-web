import type {
  CreateBranchBody,
  CreateOfficeBody,
  CreateOfficeHeadBody,
  OrganizationListQuery,
  UpdateBranchBody,
  UpdateOfficeBody,
  UpdateOfficeHeadBody
} from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { assertOrgRefsActive } from '../../lib/org-refs.js';
import { toSkipTake } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import {
  assertArchivable,
  branchBlockers,
  officeBlockers,
  officeHeadBlockers
} from './guard.js';
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

// Office names are unique WITHIN a branch — "Operations Office" may legitimately
// exist at both Main and North. Two offices with no branch are compared against
// each other.
async function assertOfficeNameFree(
  name: string,
  branchId: string | null | undefined,
  excludeId?: string
) {
  const clash = await prisma.departmentOffice.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      branchId: branchId ?? null,
      ...(excludeId && { id: { not: excludeId } })
    },
    select: { id: true }
  });
  if (clash)
    throw new AppError(
      409,
      'DUPLICATE_NAME',
      `An office named "${name}" already exists in this branch`
    );
}

async function loadOffice(id: string) {
  const office = await prisma.departmentOffice.findUnique({ where: { id } });
  if (!office) throw new AppError(404, 'NOT_FOUND', 'Office not found');
  return office;
}

export function listOffices(query: OrganizationListQuery) {
  return repo.listOffices(toSkipTake(query), query.includeArchived);
}

export async function createOffice(body: CreateOfficeBody) {
  await assertOrgRefsActive({
    branchId: body.branchId,
    officeHeadId: body.headId
  });
  await assertOfficeNameFree(body.name, body.branchId);
  return prisma.departmentOffice.create({ data: body });
}

export async function updateOffice(id: string, body: UpdateOfficeBody) {
  const existing = await loadOffice(id);
  await assertOrgRefsActive({
    branchId: body.branchId,
    officeHeadId: body.headId
  });
  // A PATCH that changes only the name must be checked against the branch the
  // office is ALREADY in; a PATCH that changes only the branch must be
  // checked against the name it ALREADY has. Re-checking on either change
  // (not just a name change) matters because the DB index can't always catch
  // it: a branch-only move to a colliding branch surfaces as a generic
  // Prisma P2002 -> 409 CONFLICT instead of 409 DUPLICATE_NAME, and a move to
  // branchId: null is invisible to the index entirely (NULL is distinct from
  // NULL in Postgres uniqueness), so two branchless "Ops" rows would silently
  // coexist.
  const name = body.name ?? existing.name;
  const branchId =
    body.branchId === undefined ? existing.branchId : body.branchId;
  if (body.name !== undefined || body.branchId !== undefined)
    await assertOfficeNameFree(name, branchId, id);
  return prisma.departmentOffice.update({ where: { id }, data: body });
}

export async function archiveOffice(id: string) {
  const office = await loadOffice(id);
  if (office.archivedAt)
    throw new AppError(409, 'ALREADY_ARCHIVED', 'Office is already archived');
  assertArchivable(office.name, await officeBlockers(id));
  return prisma.departmentOffice.update({
    where: { id },
    data: { archivedAt: new Date() }
  });
}

export async function restoreOffice(id: string) {
  const office = await loadOffice(id);
  if (!office.archivedAt)
    throw new AppError(409, 'ALREADY_ARCHIVED', 'Office is not archived');
  // Restoring under an archived parent would recreate the very state the
  // branch guard exists to prevent.
  //
  // branchId ONLY — the office's own headId is deliberately NOT checked here,
  // unlike createOffice/updateOffice above and restoreOfficeHead below, which
  // check both of their refs. The asymmetry is load-bearing, not an oversight:
  // office O and head H reference each other (O.headId = H, H.officeId = O), so
  // adding `officeHeadId: office.headId` would make an archived pair
  // permanently unrestorable — restoring O would demand H be active, restoring
  // H already demands O be active, and neither can go first.
  //
  // A branch has no such cycle (nothing points a branch at an office or a
  // head), which is why checking it here is safe and checking headId is not.
  // The cost is that a restored office may briefly name an archived head; that
  // is the same tolerated state as any record whose parent was archived after
  // the fact (see lib/org-refs.ts), and the admin can restore the head next.
  await assertOrgRefsActive({ branchId: office.branchId });
  return prisma.departmentOffice.update({
    where: { id },
    data: { archivedAt: null }
  });
}

// Office heads have NO name uniqueness — they are people, and two employees
// named Juan Cruz is not an error (§4.2).
async function loadOfficeHead(id: string) {
  const head = await prisma.officeHead.findUnique({ where: { id } });
  if (!head) throw new AppError(404, 'NOT_FOUND', 'Office head not found');
  return head;
}

export function listOfficeHeads(query: OrganizationListQuery) {
  return repo.listOfficeHeads(toSkipTake(query), query.includeArchived);
}

export async function createOfficeHead(body: CreateOfficeHeadBody) {
  await assertOrgRefsActive({
    branchId: body.branchId,
    officeId: body.officeId
  });
  return prisma.officeHead.create({ data: body });
}

export async function updateOfficeHead(id: string, body: UpdateOfficeHeadBody) {
  await loadOfficeHead(id);
  await assertOrgRefsActive({
    branchId: body.branchId,
    officeId: body.officeId
  });
  return prisma.officeHead.update({ where: { id }, data: body });
}

export async function archiveOfficeHead(id: string) {
  const head = await loadOfficeHead(id);
  if (head.archivedAt)
    throw new AppError(
      409,
      'ALREADY_ARCHIVED',
      'Office head is already archived'
    );
  assertArchivable(head.name, await officeHeadBlockers(id));
  return prisma.officeHead.update({
    where: { id },
    data: { archivedAt: new Date() }
  });
}

export async function restoreOfficeHead(id: string) {
  const head = await loadOfficeHead(id);
  if (!head.archivedAt)
    throw new AppError(409, 'ALREADY_ARCHIVED', 'Office head is not archived');
  await assertOrgRefsActive({
    branchId: head.branchId,
    officeId: head.officeId
  });
  return prisma.officeHead.update({
    where: { id },
    data: { archivedAt: null }
  });
}
