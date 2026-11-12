import {
  useMutation,
  useQueryClient,
  type QueryClient
} from '@tanstack/react-query';
import {
  createMaintenance,
  updateMaintenance,
  deleteMaintenance
} from '@/lib/api/maintenance';
import type { NewMaintenance, UpdateMaintenance } from '../types';
import { toast } from 'sonner';

async function refreshMaintenanceResults(queryClient: QueryClient, id: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['maintenances'] }),
    queryClient.invalidateQueries({ queryKey: ['maintenance', id] }),
    queryClient.invalidateQueries({ queryKey: ['analytics'] })
  ]);
}

export const useCreateMaintenance = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (maintenance: NewMaintenance) => createMaintenance(maintenance),
    onSuccess: async (maintenance) => {
      await refreshMaintenanceResults(queryClient, maintenance.id);
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
    onSuccess: async (maintenance) => {
      await refreshMaintenanceResults(queryClient, maintenance.id);
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
    onSuccess: async (_result, id) => {
      await refreshMaintenanceResults(queryClient, id);
      toast.success('Maintenance record deleted successfully!');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete maintenance record: ${error.message}`);
    }
  });
};
