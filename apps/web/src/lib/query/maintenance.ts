import { useQuery } from '@tanstack/react-query';
import {
  getMaintenances,
  getAllMaintenances,
  getMaintenanceById
} from '@/lib/api/maintenance';

export const useMaintenances = (
  page: number = 1,
  limit: number = 10,
  sort?: { sortBy: string; sortOrder: 'asc' | 'desc' }
) => {
  return useQuery({
    queryKey: ['maintenances', page, limit, sort?.sortBy, sort?.sortOrder],
    queryFn: () => getMaintenances(page, limit, sort)
  });
};

export const useAllMaintenances = () => {
  return useQuery({
    queryKey: ['maintenances', 'all'],
    queryFn: () => getAllMaintenances()
  });
};

export const useMaintenance = (id: string) => {
  return useQuery({
    queryKey: ['maintenance', id],
    queryFn: () => getMaintenanceById(id),
    enabled: !!id
  });
};
