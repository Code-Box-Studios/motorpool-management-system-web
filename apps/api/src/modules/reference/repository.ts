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

// List all branches sorted by name with pagination.
export async function listBranches(skipTake: SkipTake) {
  const [data, count] = await Promise.all([
    prisma.branch.findMany({ orderBy: { name: 'asc' }, ...skipTake }),
    prisma.branch.count()
  ]);
  return { data, count };
}

// List all offices (with embedded head) sorted by name with pagination.
export async function listOffices(skipTake: SkipTake) {
  const [data, count] = await Promise.all([
    prisma.departmentOffice.findMany({
      orderBy: { name: 'asc' },
      include: { head: true },
      ...skipTake
    }),
    prisma.departmentOffice.count()
  ]);
  return { data, count };
}

// List all office heads sorted by name with pagination.
export async function listOfficeHeads(skipTake: SkipTake) {
  const [data, count] = await Promise.all([
    prisma.officeHead.findMany({ orderBy: { name: 'asc' }, ...skipTake }),
    prisma.officeHead.count()
  ]);
  return { data, count };
}
