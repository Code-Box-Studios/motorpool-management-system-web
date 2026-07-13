import { useQuery } from '@tanstack/react-query';
import { getAllDrivers, getDriverById, getDrivers } from '../api/drivers';

export const useDrivers = (page: number = 1, limit: number = 10) => {
  return useQuery({
    queryKey: ['drivers', page, limit],
    queryFn: () => getDrivers(page, limit)
  });
};

// The whole roster — for pickers and id -> name lookups.
export const useAllDrivers = () => {
  return useQuery({
    queryKey: ['drivers', 'all'],
    queryFn: getAllDrivers
  });
};

export const useDriver = (id: string) => {
  return useQuery({
    queryKey: ['drivers', id],
    queryFn: () => getDriverById(id),
    enabled: !!id
  });
};
