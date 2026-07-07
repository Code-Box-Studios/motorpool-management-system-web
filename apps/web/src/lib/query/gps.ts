import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLatestGpsData, getGpsDataByVehicle, insertGpsData } from '@/lib/api/gps';

// Poll the newest GPS point per vehicle every 5s for the live tracking map.
export const useLatestGpsData = () => {
  return useQuery({
    queryKey: ['gps-data', 'latest'],
    queryFn: getLatestGpsData,
    refetchInterval: 5000
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
