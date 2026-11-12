// src/components/pages/maintenance/add-maintenance/actions.ts
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCreateMaintenance } from '@/lib/mutation/maintenance';
import { maintenanceSchema, type MaintenanceFormData } from '../form-schema';
export type { MaintenanceFormData } from '../form-schema';

export const useMaintenanceForm = (date?: string) => {
  return useForm<MaintenanceFormData>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: {
      vehicle_id: '',
      date: date ?? '',
      type: 'preventive',
      description: '',
      cost: '',
      mileage: '',
      next_due: ''
    }
  });
};

export const useAddMaintenanceAction = () => {
  const createMaintenance = useCreateMaintenance();

  const addMaintenance = async (data: MaintenanceFormData) => {
    await createMaintenance.mutateAsync({
      ...data,
      cost: data.cost ? Number(data.cost) : undefined,
      mileage: data.mileage ? Number(data.mileage) : undefined
    });
  };

  return { addMaintenance, isLoading: createMaintenance.isPending };
};
