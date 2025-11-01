import { useQuery } from '@tanstack/react-query';
import { getDriverById, getDrivers } from '../supabase/drivers';

export const useDrivers = (page: number = 1, limit: number = 10) => {
  return useQuery({
    queryKey: ['drivers', page, limit],
    queryFn: () => getDrivers(page, limit)
  });
};

export const useDriver = (id: string) => {
  return useQuery({
    queryKey: ['drivers', id],
    queryFn: () => getDriverById(id),
    enabled: !!id
  });
};
