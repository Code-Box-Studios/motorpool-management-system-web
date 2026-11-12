// src/components/pages/maintenance/maintenance-inner/actions.ts
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useUpdateMaintenance } from '@/lib/mutation/maintenance';
import type { UpdateMaintenance } from '@/lib/types';
import { maintenanceSchema, type MaintenanceFormData } from '../form-schema';
export type { MaintenanceFormData } from '../form-schema';

export const useMaintenanceForm = () => {
  return useForm<MaintenanceFormData>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: {
      vehicle_id: '',
      date: '',
      type: 'preventive',
      description: '',
      cost: '',
      mileage: '',
      next_due: ''
    }
  });
};

export const useUpdateMaintenanceAction = (id: string) => {
  const updateMaintenance = useUpdateMaintenance();

  const updateMaintenanceAction = async (data: UpdateMaintenance) => {
    await updateMaintenance.mutateAsync({
      id,
      updates: data
    });
  };

  return { updateMaintenanceAction, isLoading: updateMaintenance.isPending };
};
