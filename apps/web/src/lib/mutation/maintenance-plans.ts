import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  saveMaintenanceStandard,
  deleteMaintenanceStandard,
  addMaintenanceScheduleItem,
  removeMaintenanceScheduleItem,
  assignVehicleMaintenanceStandard,
  completeMaintenanceTask
} from '@/lib/api/maintenance-plans';

function useMaintenancePlanMutation<T>(
  mutationFn: (variables: T) => Promise<unknown>,
  message: string
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all(
        [
          'maintenance-standards',
          'maintenance-tracking',
          'vehicles',
          'vehicle',
          'maintenances',
          'maintenance',
          'analytics'
        ].map((key) => client.invalidateQueries({ queryKey: [key] }))
      );
      toast.success(message);
    }
  });
}
export const useSaveMaintenanceStandard = () =>
  useMaintenancePlanMutation(
    saveMaintenanceStandard,
    'Maintenance standard saved.'
  );
export const useDeleteMaintenanceStandard = () =>
  useMaintenancePlanMutation(
    deleteMaintenanceStandard,
    'Maintenance standard deleted.'
  );
export const useAddMaintenanceScheduleItem = () =>
  useMaintenancePlanMutation(
    addMaintenanceScheduleItem,
    'Schedule item added.'
  );
export const useRemoveMaintenanceScheduleItem = () =>
  useMaintenancePlanMutation(
    removeMaintenanceScheduleItem,
    'Schedule item removed.'
  );
export const useAssignMaintenanceStandard = () =>
  useMaintenancePlanMutation(
    assignVehicleMaintenanceStandard,
    'Maintenance standard assigned.'
  );
export const useCompleteMaintenanceTask = () =>
  useMaintenancePlanMutation(
    completeMaintenanceTask,
    'Maintenance completion recorded.'
  );
