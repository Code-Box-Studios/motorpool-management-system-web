// src/components/pages/maintenance/maintenance-inner/actions.ts
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUpdateMaintenance } from '@/lib/mutation/maintenance';
import type { UpdateMaintenance } from '@/lib/types';
import { MAINTENANCE_TYPE } from '@/lib/enums';

const maintenanceSchema = z.object({
  vehicle_id: z.string().uuid('Please select a vehicle'),
  date: z.string().min(1, 'Date is required'),
  type: z.enum(Object.values(MAINTENANCE_TYPE) as [string, ...string[]]),
  description: z.string().optional(),
  cost: z.string().optional(),
  mileage: z.string().optional(),
  next_due: z.string().optional()
});

export type MaintenanceFormData = z.infer<typeof maintenanceSchema>;

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
