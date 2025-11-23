import { supabase } from '.';
import type { Vehicle } from '../types';

export interface VehicleLocationUpdate {
  vehicle_id: string;
  latitude: number;
  longitude: number;
}

export const getVehiclesWithLocations = async (): Promise<Vehicle[]> => {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  if (error) {
    console.error('Error fetching vehicles with locations:', error);
    throw error;
  }

  return data as Vehicle[];
};

export const updateVehicleLocation = async (
  vehicleId: string,
  latitude: number,
  longitude: number
): Promise<void> => {
  const { error } = await supabase
    .from('vehicles')
    .update({
      latitude,
      longitude,
      last_location_update: new Date().toISOString()
    })
    .eq('id', vehicleId);

  if (error) {
    console.error('Error updating vehicle location:', error);
    throw error;
  }
};

export const subscribeToVehicleLocations = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: (payload: any) => void
) => {
  return supabase
    .channel('vehicle-locations')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'vehicles',
        filter: 'latitude=not.is.null'
      },
      callback
    )
    .subscribe();
};
