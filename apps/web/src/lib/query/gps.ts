import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getLatestGpsData,
  getGpsDataByVehicle,
  insertGpsData
} from '@/lib/api/gps';

// Poll the newest GPS point per vehicle every 5s for the live tracking map.
//
// `enabled` exists because the dashboard calls this before it knows which role
// it is rendering for — hooks cannot sit behind the role branches that return
// the guard/driver/requester screens. GET /gps/latest is admin/EVP only, so
// without a gate every other role fires a 403 every five seconds for a map they
// are never shown.
export const useLatestGpsData = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ['gps-data', 'latest'],
    queryFn: getLatestGpsData,
    refetchInterval: 5000,
    enabled
  });
};

// Fetch the last 100 GPS points recorded for a single vehicle.
export const useGpsDataByVehicle = (vehicleId: string) => {
  return useQuery({
    queryKey: ['gps-data', 'vehicle', vehicleId],
    queryFn: () => getGpsDataByVehicle(vehicleId),
    enabled: !!vehicleId
  });
};

// Simulate a device GPS ping (dashboard demo), invalidating gps-data on success.
export const useInsertGpsData = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: insertGpsData,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gps-data'] });
    }
  });
};
