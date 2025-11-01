import { useQuery } from '@tanstack/react-query';
import { getAllProfiles } from '../supabase/user-management';

export const useProfiles = () => {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: getAllProfiles
  });
};
