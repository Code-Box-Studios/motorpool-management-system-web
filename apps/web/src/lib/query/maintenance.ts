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
  search?: string,
  filters?: Record<string, string>
) => {
  return useQuery({
    queryKey: [
      'maintenances',
      page,
      limit,
      sort?.sortBy,
      sort?.sortOrder,
      search,
      filters
    ],
    queryFn: () => getMaintenances(page, limit, sort, search, filters)
  });
};

export const useAllMaintenances = (
  search?: string,
  filters?: Record<string, string>
) => {
  return useQuery({
    queryKey: ['maintenances', 'all', search, filters],
    queryFn: () => getAllMaintenances(search, filters)
  });
};

export const useMaintenance = (id: string) => {
  return useQuery({
    queryKey: ['maintenance', id],
    queryFn: () => getMaintenanceById(id),
    enabled: !!id
  });
};
