import { useQuery } from '@tanstack/react-query';
import {
  getJobOrders,
  getJobOrderById,
  getAllJobOrders
} from '@/lib/api/job-orders';

export const useJobOrders = (
  page: number = 1,
  limit: number = 10,
  userId?: string,
  userRole?: string,
  sort?: { sortBy: string; sortOrder: 'asc' | 'desc' },
  search?: string
) => {
  return useQuery({
    queryKey: [
      'job_orders',
      page,
      limit,
      userId,
      userRole,
      sort?.sortBy,
      sort?.sortOrder,
      search
    ],
    queryFn: () => getJobOrders(page, limit, userId, userRole, sort, search)
  });
};

export const useAllJobOrders = (
  userId?: string,
  userRole?: string,
  search?: string
) => {
  return useQuery({
    queryKey: ['all_job_orders', userId, userRole, search],
    queryFn: () => getAllJobOrders(userId, userRole, search)
  });
};

export const useJobOrder = (id: string) => {
  return useQuery({
    queryKey: ['job_order', id],
    queryFn: () => getJobOrderById(id),
    enabled: !!id
  });
};
