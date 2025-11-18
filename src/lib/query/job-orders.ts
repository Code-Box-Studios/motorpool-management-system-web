import { useQuery } from '@tanstack/react-query';
import { getJobOrders, getJobOrderById } from '@/lib/supabase/job-orders';

export const useJobOrders = (page: number = 1, limit: number = 10) => {
  return useQuery({
    queryKey: ['job_orders', page],
    queryFn: () => getJobOrders(page, limit)
  });
};

export const useJobOrder = (id: string) => {
  return useQuery({
    queryKey: ['job_order', id],
    queryFn: () => getJobOrderById(id),
    enabled: !!id
  });
};
