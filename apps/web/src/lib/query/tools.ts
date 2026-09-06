import { useQuery } from '@tanstack/react-query';
import { getTools, getToolById, getToolBorrowStats } from '@/lib/api/tools';

export const useTools = (
  page: number = 1,
  limit: number = 10,
  sort?: { sortBy: string; sortOrder: 'asc' | 'desc' }
) => {
  return useQuery({
    queryKey: ['tools', page, sort?.sortBy, sort?.sortOrder],
    queryFn: () => getTools(page, limit, sort)
  });
};

export const useTool = (id: string) => {
  return useQuery({
    queryKey: ['tool', id],
    queryFn: () => getToolById(id),
    enabled: !!id
  });
};

// Keyed under ['tools'] on purpose: invalidateQueries is prefix-matching, so
// the existing create/update/delete mutations already refresh these numbers.
// Adding a second invalidation would be dead code.
export const useToolBorrowStats = () =>
  useQuery({
    queryKey: ['tools', 'stats'],
    queryFn: getToolBorrowStats
  });
