import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLatestGpsData, insertGpsData, getGpsDataByVehicle, subscribeToGpsUpdates } from '../supabase/gps';
import { useEffect } from 'react';

export const useLatestGpsData = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['gps-data', 'latest'],
    queryFn: getLatestGpsData,
    refetchInterval: 5000 
  });

  useEffect(() => {
    const channel = subscribeToGpsUpdates((payload) => {
      console.log('GPS update received:', payload);
      queryClient.invalidateQueries({ queryKey: ['gps-data'] });
    });

    return () => {
      channel.unsubscribe();
    };
  }, [queryClient]);

  return query;
};

export const useGpsDataByVehicle = (vehicleId: string) => {
  return useQuery({
    queryKey: ['gps-data', 'vehicle', vehicleId],
    queryFn: () => getGpsDataByVehicle(vehicleId),
    enabled: !!vehicleId
  });
};

export const useInsertGpsData = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: insertGpsData,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gps-data'] });
    }
  });
};
