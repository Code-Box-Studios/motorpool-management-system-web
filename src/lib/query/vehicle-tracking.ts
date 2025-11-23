import { useQuery } from '@tanstack/react-query';
import { getVehiclesWithLocations } from '@/lib/supabase/vehicle-tracking';
import { useEffect } from 'react';
import { subscribeToVehicleLocations } from '@/lib/supabase/vehicle-tracking';
import { useQueryClient } from '@tanstack/react-query';

export const useVehicleLocations = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['vehicle-locations'],
    queryFn: () => getVehiclesWithLocations(),
    refetchInterval: 30000 
  });

  useEffect(() => {
    const subscription = subscribeToVehicleLocations((payload) => {
      console.log('Vehicle location updated:', payload);
      queryClient.invalidateQueries({ queryKey: ['vehicle-locations'] });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient]);

  return query;
};
