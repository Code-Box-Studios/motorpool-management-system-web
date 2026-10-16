import { useCallback } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';

// These client-side lists share a route with a separately paginated table.
// Changing their search must not discard that table's page or scroll position.
export function useScopedListSearch(key: string) {
  const params = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const search = typeof params[key] === 'string' ? (params[key] as string) : '';
  const setSearch = useCallback(
    (value: string) => {
      void navigate({
        to: '.',
        search: (previous: Record<string, unknown>) => ({
          ...previous,
          [key]: value.trim() || undefined
        }),
        replace: true,
        resetScroll: false
      });
    },
    [key, navigate]
  );
  return { search, setSearch };
}
