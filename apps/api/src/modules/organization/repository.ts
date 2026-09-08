import { prisma } from '../../lib/prisma.js';

type SkipTake = { skip: number; take: number } | Record<string, never>;

// Archived rows are excluded unless explicitly asked for. This single default
// is what removes archived records from every dropdown in the app without
// editing any of those call sites.
function archiveWhere(includeArchived: boolean | undefined) {
  return includeArchived ? {} : { archivedAt: null };
}

export async function listBranches(
  skipTake: SkipTake,
  includeArchived?: boolean
) {
  const where = archiveWhere(includeArchived);
  const [data, count] = await Promise.all([
    prisma.branch.findMany({ where, orderBy: { name: 'asc' }, ...skipTake }),
    prisma.branch.count({ where })
  ]);
  return { data, count };
}

export async function listOffices(
  skipTake: SkipTake,
  includeArchived?: boolean
) {
  const where = archiveWhere(includeArchived);
  const [data, count] = await Promise.all([
    prisma.departmentOffice.findMany({
      where,
      orderBy: { name: 'asc' },
      // The FE's office picker renders the head's name inline, so the list has
      // always embedded it. Keep that or the picker regresses.
      include: { head: true },
      ...skipTake
    }),
    prisma.departmentOffice.count({ where })
  ]);
  return { data, count };
}

export async function listOfficeHeads(
  skipTake: SkipTake,
  includeArchived?: boolean
) {
  const where = archiveWhere(includeArchived);
  const [data, count] = await Promise.all([
    prisma.officeHead.findMany({
      where,
      orderBy: { name: 'asc' },
      ...skipTake
    }),
    prisma.officeHead.count({ where })
  ]);
  return { data, count };
}

export async function listEmployees(
  skipTake: SkipTake,
  includeArchived?: boolean,
  branchId?: string
) {
  // BOTH filters, never one or the other: the guide picker asks for one
  // branch's active roster, and the Organization tab asks for one branch's
  // full roster with ?includeArchived=true.
  const where = {
    ...archiveWhere(includeArchived),
    ...(branchId ? { branchId } : {})
  };
  const [data, count] = await Promise.all([
    prisma.employee.findMany({
      where,
      orderBy: { name: 'asc' },
      ...skipTake
    }),
    prisma.employee.count({ where })
  ]);
  return { data, count };
}
