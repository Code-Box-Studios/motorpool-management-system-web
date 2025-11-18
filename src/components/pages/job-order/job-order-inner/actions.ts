// src/components/pages/job-order/job-order-inner/actions.ts
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUpdateJobOrder } from '@/lib/mutation/job-orders';
import type { UpdateJobOrder } from '@/lib/types';
import { JOB_ORDER_STATUS } from '@/lib/enums';

const jobOrderSchema = z.object({
  vehicle_id: z.string().uuid('Please select a vehicle'),
  submitted_by: z.string().uuid('Submitted by is required'),
  incident_date: z.string().min(1, 'Incident date is required'),
  incident_details: z.string().optional(),
  damage_info: z.string().optional(),
  date_of_request: z.string().optional(),
  requested_by: z.string().optional(),
  noted_by: z.string().optional(),
  approved_by: z.string().optional(),
  date_approved: z.string().optional(),
  assigned_mechanic: z.string().optional(),
  repair_plan: z.string().optional(),
  target_date: z.string().optional(),
  repair_done: z.coerce.number().min(0, 'Repair done must be 0 or greater').optional(),
  actual_date_of_release: z.string().optional(),
  status: z.enum(Object.values(JOB_ORDER_STATUS) as [string, ...string[]]),
  remarks: z.string().optional(),
  job_descriptions: z.array(z.string()).optional(),
  images: z.array(z.string()).optional()
});

export type JobOrderFormData = z.infer<typeof jobOrderSchema>;

export const useJobOrderForm = () => {
  return useForm<JobOrderFormData>({
    resolver: zodResolver(jobOrderSchema),
    defaultValues: {
      vehicle_id: '',
      submitted_by: '',
      incident_date: '',
      incident_details: '',
      damage_info: '',
      date_of_request: '',
      requested_by: '',
      noted_by: '',
      approved_by: '',
      date_approved: '',
      assigned_mechanic: '',
      repair_plan: '',
      target_date: '',
      repair_done: 0,
      actual_date_of_release: '',
      status: 'pending',
      remarks: '',
      job_descriptions: [],
      images: []
    }
  });
};

export const useUpdateJobOrderAction = (id: string) => {
  const updateJobOrder = useUpdateJobOrder();

  const updateJobOrderAction = async (data: JobOrderFormData) => {
    await updateJobOrder.mutateAsync({
      id,
      updates: data as UpdateJobOrder
    });
  };

  return { updateJobOrderAction, isLoading: updateJobOrder.isPending };
};
