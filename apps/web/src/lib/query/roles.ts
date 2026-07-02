import { useQuery } from '@tanstack/react-query';
import { getRoles, getRoleById } from '../supabase/roles';

export const useRoles = () => {
  return useQuery({
    queryKey: ['roles'],
    queryFn: getRoles,
  });
};

export const useRole = (id: string) => {
  return useQuery({
    queryKey: ['roles', id],
    queryFn: () => getRoleById(id),
    enabled: !!id,
  });
};
