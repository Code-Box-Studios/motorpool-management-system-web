import { useQuery } from '@tanstack/react-query';
import { getVehicles, getVehicleById } from '@/lib/supabase/vehicles';
import type { VehicleWithBranch } from '@/lib/types';

export const useVehicles = (page: number = 1, limit: number = 10) => {
  return useQuery<{ data: VehicleWithBranch[]; count: number | null }>({
    queryKey: ['vehicles', page],
    queryFn: () => getVehicles(page, limit)
  });
};

export const useVehicle = (id: string) => {
  return useQuery({
    queryKey: ['vehicle', id],
    queryFn: () => getVehicleById(id),
    enabled: !!id
  });
};
