import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createJobOrder,
  updateJobOrder,
  deleteJobOrder,
  noteJobOrder,
  approveJobOrder,
  completeRepairJobOrder
} from '@/lib/api/job-orders';
import type { ApiError } from '@/lib/api/client';
import type { NewJobOrder } from '../types';
import { toast } from 'sonner';

export const useCreateJobOrder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobOrder: NewJobOrder) => createJobOrder(jobOrder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job_orders'] });
      toast.success('Job order created successfully!');
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to create job order: ${error.message}`);
    }
  });
};

export const useUpdateJobOrder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Record<string, unknown> }) => updateJobOrder(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job_orders'] });
      toast.success('Job order updated successfully!');
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to update job order: ${error.message}`);
    }
  });
};

export const useDeleteJobOrder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteJobOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job_orders'] });
      toast.success('Job order deleted successfully!');
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to delete job order: ${error.message}`);
    }
  });
};

// Invalidates both the list and the single-order cache for `id` — shared by
// every transition hook below.
const invalidateJobOrder = (queryClient: ReturnType<typeof useQueryClient>, id: string) => {
  queryClient.invalidateQueries({ queryKey: ['job_orders'] });
  queryClient.invalidateQueries({ queryKey: ['job_order', id] });
};

// admin: notes the job order — assigns a mechanic, schedule dates, and the
// spare parts used (moves pending -> assigned_mechanic).
export const useNoteJobOrder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      assignedMechanicId,
      dateOfRequest,
      targetDate,
      spareParts
    }: {
      id: string;
      assignedMechanicId: string;
      dateOfRequest?: string;
      targetDate?: string;
      spareParts: { sparePartId: string; quantity: number }[];
    }) => noteJobOrder(id, { assignedMechanicId, dateOfRequest, targetDate, spareParts }),
    onSuccess: (_data, variables) => {
      invalidateJobOrder(queryClient, variables.id);
      toast.success('Job order noted successfully!');
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to note job order: ${error.message}`);
    }
  });
};

// evp_operations: approves the noted job order (assigned_mechanic -> ongoing_repair). No body.
export const useApproveJobOrder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => approveJobOrder(id),
    onSuccess: (_data, variables) => {
      invalidateJobOrder(queryClient, variables.id);
      toast.success('Job order approved successfully!');
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to approve job order: ${error.message}`);
    }
  });
};

// admin: records the repair outcome (ongoing_repair -> repaired).
export const useCompleteRepair = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      repairDone,
      remarks,
      actualDateOfRelease
    }: {
      id: string;
      repairDone: string;
      remarks?: string;
      actualDateOfRelease?: string;
    }) => completeRepairJobOrder(id, { repairDone, remarks, actualDateOfRelease }),
    onSuccess: (_data, variables) => {
      invalidateJobOrder(queryClient, variables.id);
      toast.success('Job order repair completed successfully!');
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to complete repair: ${error.message}`);
    }
  });
};
