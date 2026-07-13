// src/components/pages/job-order/job-order-inner/actions.ts
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUpdateJobOrder } from '@/lib/mutation/job-orders';
import type { UpdateJobOrder } from '@/lib/types';
import { JOB_ORDER_STATUS, REPAIR_DONE_TYPE } from '@/lib/enums';

const jobOrderSchema = z
  .object({
    vehicle_id: z.string().uuid('Please select a vehicle'),
    branch_id: z.string().uuid('Please select a branch'),
    incident_date: z.string().min(1, 'Incident date is required'),
    incident_details: z.string().optional(),
    remarks: z.string().optional(),
    spare_parts_used: z.array(z.string()).optional(),
    status: z.enum(Object.values(JOB_ORDER_STATUS) as [string, ...string[]]),
    requested_by: z.string().optional(),
    noted_by: z.string().optional(),
    approved_by: z.string().optional(),
    // Admin fields - required when status is 'assigned_mechanic'
    date_of_request: z.string().optional(), // Vehicle Date Accepted
    target_date: z.string().optional(), // Target Date of Repair
    assigned_mechanic: z.string().optional(),
    actual_date_of_release: z.string().optional(), // Vehicle Date of Release
    repair_done: z
      .enum([...Object.values(REPAIR_DONE_TYPE), ''] as unknown as [
        string,
        ...string[]
      ])
      .optional(),
    date_approved: z.string().optional()
  })
  .refine(
    (data) => {
      // When status is 'assigned_mechanic', these fields are required
      if (data.status === JOB_ORDER_STATUS.ASSIGNED_MECHANIC) {
        return (
          data.date_of_request &&
          data.target_date &&
          data.assigned_mechanic &&
          data.repair_done &&
          data.noted_by
        );
      }
      return true;
    },
    {
      message:
        'Vehicle Date Accepted, Target Date, Assigned Mechanic, Repair Done, and Noted By are required when status is Assigned Mechanic',
      path: ['status']
    }
  );

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
      spare_parts_used: [],
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
