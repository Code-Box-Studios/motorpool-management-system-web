import { useQuery } from '@tanstack/react-query';
import {
  getAllSpareParts,
  getSpareParts,
  getSparePartById
} from '@/lib/api/spare-parts';

export const useSpareParts = (
  page: number = 1,
  limit: number = 10,
  sort?: { sortBy: string; sortOrder: 'asc' | 'desc' }
) => {
  return useQuery({
    queryKey: ['spare_parts', page, limit, sort?.sortBy, sort?.sortOrder],
    queryFn: () => getSpareParts(page, limit, sort)
  });
};

// The whole catalogue — for the parts pickers.
export const useAllSpareParts = () => {
  return useQuery({
    queryKey: ['spare_parts', 'all'],
    queryFn: getAllSpareParts
  });
};

export const useSparePart = (id: string) => {
  return useQuery({
    queryKey: ['spare_part', id],
    queryFn: () => getSparePartById(id),
    enabled: !!id
  });
};
