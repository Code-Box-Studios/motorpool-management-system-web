import type { SortOrder } from '@mms/shared';
import type { Prisma } from '@prisma/client';

// Maps a validated sortBy/sortOrder pair onto a Prisma orderBy through the
// entity's own column map, falling back to the list's default ordering when
// the caller did not ask for a sort. Map values are builder functions
// returning full orderBy fragments, so related-field sorts
// ({ vehicle: { make: order } }) fit the same shape as scalars.
export function toOrderBy<T>(
  sortBy: string | undefined,
  sortOrder: SortOrder | undefined,
  columns: Record<string, (order: Prisma.SortOrder) => T>,
  fallback: T
): T {
  if (!sortBy) return fallback;
  const build = columns[sortBy];
  if (!build) return fallback;
  return build(sortOrder ?? 'asc');
}
