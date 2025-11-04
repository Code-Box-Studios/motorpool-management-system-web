// src/lib/query/user-management.ts
import { useQuery } from '@tanstack/react-query';
import { getAllAdmins } from '../supabase/user-management';

export const useAdmins = () => {
  return useQuery({
    queryKey: ['admins'],
    queryFn: getAllAdmins
  });
};