import { useQuery } from '@tanstack/react-query';
import {
  getMaintenances,
  getAllMaintenances,
  getMaintenanceById
} from '@/lib/api/maintenance';

export const useMaintenances = (
  page: number = 1,
  limit: number = 10,
  sort?: { sortBy: string; sortOrder: 'asc' | 'desc' },
  search?: string
) => {
  return useQuery({
    queryKey: [
      'maintenances',
      page,
      limit,
      sort?.sortBy,
      sort?.sortOrder,
      search
    ],
    queryFn: () => getMaintenances(page, limit, sort, search)
  });
};

export const useAllMaintenances = (search?: string) => {
  return useQuery({
    queryKey: ['maintenances', 'all', search],
    queryFn: () => getAllMaintenances(search)
  });
};

export const useMaintenance = (id: string) => {
  return useQuery({
    queryKey: ['maintenance', id],
    queryFn: () => getMaintenanceById(id),
    enabled: !!id
  });
};
