import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createDriver, updateDriver, deleteDriver } from '../supabase/drivers';

export const useCreateDriver = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createDriver,
    onSuccess: () => {
      toast.success('Driver created successfully!');
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    },
    onError: (error) => {
      toast.error(`Driver creation failed: ${error.message}`);
    }
  });
};

export const useUpdateDriver = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates
    }: {
      id: string;
      updates: Parameters<typeof updateDriver>[1];
    }) => updateDriver(id, updates),
    onSuccess: () => {
      toast.success('Driver updated successfully!');
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    },
    onError: (error) => {
      toast.error(`Driver update failed: ${error.message}`);
    }
  });
};

export const useDeleteDriver = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteDriver,
    onSuccess: () => {
      toast.success('Driver deleted successfully!');
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    },
    onError: (error) => {
      toast.error(`Driver deletion failed: ${error.message}`);
    }
  });
};
