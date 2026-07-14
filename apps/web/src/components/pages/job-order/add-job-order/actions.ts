// src/components/pages/job-order/add-job-order/actions.ts
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateJobOrder } from '@/lib/mutation/job-orders';
import type { NewJobOrder } from '@/lib/types';

// Raising a repair. These are the ONLY six fields the API accepts on create
// (createJobOrderBodySchema) — the schema used to also carry status,
// assigned_mechanic, target_date, repair_done, approved_by and friends, which
// read as though this form could open a job order already assigned, or already
// repaired. It never could: the API strips them and hard-codes `pending`, and
// every one of them is reached through a transition (note -> approve ->
// complete-repair) with its own guard. Carrying them here only invited someone
// to wire up a control that would silently do nothing.
const jobOrderSchema = z.object({
  vehicle_id: z.string().uuid('Please select a vehicle'),
  branch_id: z.string().uuid('Please select a branch'),
  // A fault cannot have happened tomorrow. The API refuses it
  // (400 INCIDENT_IN_THE_FUTURE) — catch it here so it lands on the field
  // instead of coming back as a failed submit.
  incident_date: z
    .string()
    .min(1, 'Incident date is required')
    .refine((v) => new Date(v).getTime() <= Date.now(), {
      message: 'The incident cannot be in the future'
    }),
  // The admin assigns a mechanic and notes the parts off the back of this, so a
  // repair request that says nothing is one nobody can work.
  incident_details: z.string().min(1, 'Describe what is wrong'),
  remarks: z.string().optional(),
  requested_by: z.string().optional()
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
      requested_by: ''
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
