import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createMaintenance, updateMaintenance } from '@/lib/supabase/maintenance';
import type { NewMaintenance, UpdateMaintenance } from '../types';

export const useCreateMaintenance = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (maintenance: NewMaintenance) => createMaintenance(maintenance),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenances'] });
    }
  });
};

export const useUpdateMaintenance = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates
    }: {
      id: string;
      updates: UpdateMaintenance;
    }) => updateMaintenance(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenances'] });
    }
  });
};
