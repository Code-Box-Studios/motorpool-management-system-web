import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createJobOrder, updateJobOrder } from '@/lib/supabase/job-orders';
import type { NewJobOrder, UpdateJobOrder } from '../types';

export const useCreateJobOrder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobOrder: NewJobOrder) => createJobOrder(jobOrder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job_orders'] });
    }
  });
};

export const useUpdateJobOrder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates
    }: {
      id: string;
      updates: UpdateJobOrder;
    }) => updateJobOrder(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job_orders'] });
    }
  });
};
