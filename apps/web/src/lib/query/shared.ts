import { useQuery } from '@tanstack/react-query';
import { getAllBranches } from '../api/shared';

export const useBranches = () => {
  return useQuery({
    queryKey: ['branches'],
    queryFn: () => getAllBranches()
  });
};
