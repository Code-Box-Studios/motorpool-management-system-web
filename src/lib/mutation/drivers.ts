import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createDriver, updateDriver, deleteDriver } from '../supabase/drivers';
import type { AuthError } from '@supabase/supabase-js';
import type { NewDriver, UpdateDriver } from '../types'; 

export const useCreateDriver = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      fullName,
      email
    }: {
      userId: string;
      fullName: string;
      email: string;
    }) => {
      const driverData: NewDriver = {
        id: userId,
        full_name: fullName,
        email: email,
      };
      return createDriver(driverData);
    },
    onSuccess: () => {
      toast.success('Driver created successfully!');
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    },
    onError: (error: AuthError) => {
      toast.error(`Driver creation failed: ${error?.message ?? String(error)}`);
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
      updates: UpdateDriver;
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