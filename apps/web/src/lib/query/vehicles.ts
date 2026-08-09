import { useQuery } from '@tanstack/react-query';
import {
  getAllVehicles,
  getVehicles,
  getVehicleById
} from '@/lib/api/vehicles';
import type { VehicleWithBranch } from '@/lib/types';

export const useVehicles = (
  page: number = 1,
  limit: number = 10,
  sort?: { sortBy: string; sortOrder: 'asc' | 'desc' }
) => {
  return useQuery<{ data: VehicleWithBranch[]; count: number | null }>({
    // `limit` is part of the key: the pickers fetch page 1 at limit 100/200
    // and must not share a cache entry with the vehicles list's page 1 of 10.
    queryKey: ['vehicles', page, limit, sort?.sortBy, sort?.sortOrder],
    queryFn: () => getVehicles(page, limit, sort)
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
