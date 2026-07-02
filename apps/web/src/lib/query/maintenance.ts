import { useQuery } from '@tanstack/react-query';
import { getMaintenances, getAllMaintenances, getMaintenanceById } from '@/lib/supabase/maintenance';

export const useMaintenances = (page: number = 1, limit: number = 10) => {
  return useQuery({
    queryKey: ['maintenances', page],
    queryFn: () => getMaintenances(page, limit)
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
