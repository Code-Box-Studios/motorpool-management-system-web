// src/components/pages/job-order/add-job-order/actions.ts
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateJobOrder } from '@/lib/mutation/job-orders';
import type { NewJobOrder } from '@/lib/types';
import { JOB_ORDER_STATUS } from '@/lib/enums';

// Driver form - initial job order submission
const jobOrderSchema = z.object({
  vehicle_id: z.string().uuid('Please select a vehicle'),
  branch_id: z.string().uuid('Please select a branch'),
  incident_date: z.string().min(1, 'Incident date is required'),
  incident_details: z.string().optional(),
  remarks: z.string().optional(),
  status: z.enum(Object.values(JOB_ORDER_STATUS) as [string, ...string[]]),
  requested_by: z.string().optional(),
  noted_by: z.string().optional(),
  approved_by: z.string().optional(),
  // Admin fields - not filled during initial creation
  date_of_request: z.string().optional(),
  target_date: z.string().optional(),
  assigned_mechanic: z.string().optional(),
  actual_date_of_release: z.string().optional(),
  repair_done: z.string().optional(),
  date_approved: z.string().optional()
});

export type JobOrderFormData = z.infer<typeof jobOrderSchema>;

export const useJobOrderForm = () => {
  return useForm<JobOrderFormData>({
    resolver: zodResolver(jobOrderSchema),
    defaultValues: {
      vehicle_id: '',
      branch_id: '',
      incident_date: '',
      incident_details: '',
      remarks: '',
      status: 'pending',
      requested_by: '',
      noted_by: '',
      approved_by: '',
      date_of_request: '',
      target_date: '',
      assigned_mechanic: '',
      actual_date_of_release: '',
      repair_done: '',
      date_approved: ''
    }
  });
};

export const useAddJobOrderAction = () => {
  const createJobOrder = useCreateJobOrder();

  const addJobOrder = async (data: JobOrderFormData) => {
    await createJobOrder.mutateAsync(data as NewJobOrder);
  };

  return { addJobOrder, isLoading: createJobOrder.isPending };
};
