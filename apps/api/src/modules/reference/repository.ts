import { prisma } from '../../lib/prisma.js';

type SkipTake = { skip: number; take: number } | Record<string, never>;

// List all roles sorted by name with pagination.
export async function listRoles(skipTake: SkipTake) {
  const [data, count] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: 'asc' }, ...skipTake }),
    prisma.role.count()
  ]);
  return { data, count };
}
