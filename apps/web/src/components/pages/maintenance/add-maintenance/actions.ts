// src/components/pages/maintenance/add-maintenance/actions.ts
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateMaintenance } from '@/lib/mutation/maintenance';
import type { NewMaintenance } from '@/lib/types';
import { MAINTENANCE_TYPE } from '@/lib/enums';

const maintenanceSchema = z.object({
  vehicle_id: z.string().uuid('Please select a vehicle'),
  date: z.string().min(1, 'Date is required'),
  type: z.enum(Object.values(MAINTENANCE_TYPE) as [string, ...string[]]),
  description: z.string().optional(),
  cost: z.coerce.number().min(0, 'Cost must be 0 or greater').optional(),
  mileage: z.coerce.number().min(0, 'Mileage must be 0 or greater').optional(),
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
      cost: undefined,
      mileage: undefined,
      next_due: ''
    }
  });
};

export const useAddMaintenanceAction = () => {
  const createMaintenance = useCreateMaintenance();

  const addMaintenance = async (data: MaintenanceFormData) => {
    await createMaintenance.mutateAsync(data as NewMaintenance);
  };

  return { addMaintenance, isLoading: createMaintenance.isPending };
};
