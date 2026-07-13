import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createMaintenance,
  updateMaintenance,
  deleteMaintenance
} from '@/lib/api/maintenance';
import type { NewMaintenance, UpdateMaintenance } from '../types';
import { toast } from 'sonner';

export const useCreateMaintenance = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (maintenance: NewMaintenance) => createMaintenance(maintenance),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenances'] });
      toast.success('Maintenance record created successfully!');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create maintenance record: ${error.message}`);
    }
  });
};

export const useUpdateMaintenance = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateMaintenance }) =>
      updateMaintenance(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenances'] });
      toast.success('Maintenance record updated successfully!');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update maintenance record: ${error.message}`);
    }
  });
};

export const useDeleteMaintenance = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMaintenance(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenances'] });
      toast.success('Maintenance record deleted successfully!');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete maintenance record: ${error.message}`);
    }
  });
};
