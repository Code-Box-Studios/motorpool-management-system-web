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
