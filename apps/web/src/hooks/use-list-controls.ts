import { useCallback } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { SortState } from '@/components/shared/sortable-table-head';

type ListSearch = {
  page?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

// List-table controls (page + sort) live in the URL rather than component
// state, so a refresh, a shared link, or back/forward lands on the same view.
// Functional search updates preserve unrelated params on the route (e.g. the
// maintenance page's ?tab=). Defaults stay OUT of the URL: page 1 and
// "no sort" are written as undefined, which the router drops from the query
// string.
export function useListControls() {
  const search = useSearch({ strict: false }) as ListSearch;
  const navigate = useNavigate();

  const rawPage = Number(search.page);
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const sort: SortState | null =
    typeof search.sortBy === 'string' && search.sortBy
      ? {
          sortBy: search.sortBy,
          sortOrder: search.sortOrder === 'desc' ? 'desc' : 'asc'
        }
      : null;

  // Stable identities (navigate itself is stable), so pages can safely list
  // these in effect dependency arrays without re-firing every render.
  const setPage = useCallback(
    (next: number) => {
      void navigate({
        to: '.',
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          page: next <= 1 ? undefined : next
        }),
        replace: true
      });
    },
    [navigate]
  );

  // A new sort re-shuffles the whole list, so the current page number no
  // longer points at anything meaningful — reset to page 1.
  const handleSort = useCallback(
    (next: SortState) => {
      void navigate({
        to: '.',
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          sortBy: next.sortBy,
          sortOrder: next.sortOrder,
          page: undefined
        }),
        replace: true
      });
    },
    [navigate]
  );

  return { page, sort, setPage, handleSort };
}
