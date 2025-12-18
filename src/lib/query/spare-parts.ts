import { useQuery } from '@tanstack/react-query';
import { getSpareParts, getSparePartById } from '@/lib/supabase/spare-parts';

export const useSpareParts = (page: number = 1, limit: number = 10) => {
  return useQuery({
    queryKey: ['spare_parts', page],
    queryFn: () => getSpareParts(page, limit)
  });
};

export const useSparePart = (id: string) => {
  return useQuery({
    queryKey: ['spare_part', id],
    queryFn: () => getSparePartById(id),
    enabled: !!id
  });
};
