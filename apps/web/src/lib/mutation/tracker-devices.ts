import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  createTrackerDevice,
  updateTrackerDevice,
  deleteTrackerDevice
} from '@/lib/api/tracker-devices';
import type { ApiError } from '@/lib/api/client';
import type {
  CreateTrackerDeviceBody,
  UpdateTrackerDeviceBody
} from '@mms/shared';

export const useCreateTrackerDevice = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTrackerDeviceBody) => createTrackerDevice(body),
    onSuccess: () => {
      toast.success('Tracker device registered successfully!');
      queryClient.invalidateQueries({ queryKey: ['tracker-devices'] });
    },
    onError: (error: ApiError) => {
      toast.error(`Registration failed: ${error?.message ?? String(error)}`);
    }
  });
};

export const useUpdateTrackerDevice = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates
    }: {
      id: string;
      updates: UpdateTrackerDeviceBody;
    }) => updateTrackerDevice(id, updates),
    onSuccess: () => {
      toast.success('Tracker device updated successfully!');
      queryClient.invalidateQueries({ queryKey: ['tracker-devices'] });
    },
    onError: (error: ApiError) => {
      toast.error(`Update failed: ${error?.message ?? String(error)}`);
    }
  });
};

export const useDeleteTrackerDevice = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTrackerDevice(id),
    onSuccess: () => {
      toast.success('Tracker device deleted successfully!');
      queryClient.invalidateQueries({ queryKey: ['tracker-devices'] });
    },
    onError: (error: ApiError) => {
      toast.error(`Deletion failed: ${error?.message ?? String(error)}`);
    }
  });
};
