import { useQuery } from '@tanstack/react-query';
import { getTools, getToolById } from '@/lib/supabase/tools';

export const useTools = (page: number = 1, limit: number = 10) => {
  return useQuery({
    queryKey: ['tools', page],
    queryFn: () => getTools(page, limit)
  });
};

export const useTool = (id: string) => {
  return useQuery({
    queryKey: ['tool', id],
    queryFn: () => getToolById(id),
    enabled: !!id
  });
};
