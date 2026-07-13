import { useQuery } from '@tanstack/react-query';
import {
  getAllVehicles,
  getVehicles,
  getVehicleById
} from '@/lib/api/vehicles';
import type { VehicleWithBranch } from '@/lib/types';

export const useVehicles = (page: number = 1, limit: number = 10) => {
  return useQuery<{ data: VehicleWithBranch[]; count: number | null }>({
    queryKey: ['vehicles', page],
    queryFn: () => getVehicles(page, limit)
  });
};

// The whole fleet — for the vehicle pickers.
export const useAllVehicles = () => {
  return useQuery<VehicleWithBranch[]>({
    queryKey: ['vehicles', 'all'],
    queryFn: getAllVehicles
  });
};

export const useVehicle = (id: string) => {
  return useQuery({
    queryKey: ['vehicle', id],
    queryFn: () => getVehicleById(id),
    enabled: !!id
  });
};
