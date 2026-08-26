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
