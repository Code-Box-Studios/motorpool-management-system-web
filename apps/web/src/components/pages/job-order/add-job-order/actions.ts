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
const jobOrderSchema = z
  .object({
    vehicle_id: z.string().uuid('Please select a vehicle'),
    branch_id: z.string().uuid('Please select a branch'),
    // May be in the future: preventive work is scheduled ahead, months out.
    incident_date: z.string().min(1, 'Incident date is required'),
    // Picked from JOB_ORDER_SERVICES.
    services: z.array(z.string()),
    // "Additional Services to be done": anything not on the list. Optional.
    incident_details: z.string().optional(),
    remarks: z.string().optional(),
    maintenance_type: z.string().optional(),
    service_location: z.string().optional(),
    requested_by: z.string().optional()
  })
  // The admin assigns a mechanic and notes the parts off the back of this, so a
  // repair request that names no work is one nobody can act on.
  .superRefine((data, ctx) => {
    if (data.services.length === 0 && !data.incident_details?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['services'],
        message: 'Choose a service or describe the additional services'
      });
    }
  });

export type JobOrderFormData = z.infer<typeof jobOrderSchema>;

export const useJobOrderForm = (initialIncidentDate = '') => {
  return useForm<JobOrderFormData>({
    resolver: zodResolver(jobOrderSchema),
    defaultValues: {
      vehicle_id: '',
      branch_id: '',
      incident_date: initialIncidentDate,
      services: [],
      incident_details: '',
      remarks: '',
      maintenance_type: '',
      service_location: '',
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
