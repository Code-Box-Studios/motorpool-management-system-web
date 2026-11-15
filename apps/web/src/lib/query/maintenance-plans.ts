import { useQuery } from '@tanstack/react-query';
import {
  getMaintenanceStandards,
  getVehicleMaintenanceTracking
} from '@/lib/api/maintenance-plans';

export const useMaintenanceStandards = () =>
  useQuery({
    queryKey: ['maintenance-standards'],
    queryFn: getMaintenanceStandards
  });
export const useVehicleMaintenanceTracking = (vehicleId: string) =>
  useQuery({
    queryKey: ['maintenance-tracking', vehicleId],
    queryFn: () => getVehicleMaintenanceTracking(vehicleId),
    enabled: Boolean(vehicleId)
  });
