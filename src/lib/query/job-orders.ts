import { useQuery } from '@tanstack/react-query';
import { getJobOrders, getJobOrderById, getAllJobOrders } from '@/lib/supabase/job-orders';

export const useJobOrders = (page: number = 1, limit: number = 10, userId?: string, userRole?: string) => {
  return useQuery({
    queryKey: ['job_orders', page, userId, userRole],
    queryFn: () => getJobOrders(page, limit, userId, userRole)
  });
};

export const useAllJobOrders = (userId?: string, userRole?: string) => {
  return useQuery({
    queryKey: ['all_job_orders', userId, userRole],
    queryFn: () => getAllJobOrders(userId, userRole)
  });
};

export const useJobOrder = (id: string) => {
  return useQuery({
    queryKey: ['job_order', id],
    queryFn: () => getJobOrderById(id),
    enabled: !!id
  });
};
