import type { PaginationQuery } from '@mms/shared';

// Spec §6: page is 1-indexed; both params omitted -> full result set.
export function toSkipTake(
  q: PaginationQuery
): { skip: number; take: number } | Record<string, never> {
  if (q.page === undefined && q.limit === undefined) return {};
  const limit = q.limit ?? 10;
  const page = q.page ?? 1;
  return { skip: (page - 1) * limit, take: limit };
}
