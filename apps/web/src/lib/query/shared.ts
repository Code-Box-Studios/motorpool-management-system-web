import { useQuery } from "@tanstack/react-query";
import { getAllBranches } from "../supabase/shared";

export const useBranches = () => {
  return useQuery({
    queryKey: ['branches'],
    queryFn: () => getAllBranches()
  });
};