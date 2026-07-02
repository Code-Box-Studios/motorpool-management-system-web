import { supabase } from '.';

export interface GpsDataWithVehicle {
  gps_id: string;
  vehicle_id: string | null;
  trip_id: string | null;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  heading: number | null;
  engine_status: string | null;
  created_at: string;
  vehicles?: {
    id: string;
    make: string;
    model: string;
    license_plate: string;
    status: string;
    mileage: number;
    fuel_type: string;
  } | null;
}

export interface GpsDataInsert {
  vehicle_id: string;
  trip_id?: string | null;
  latitude: number;
  longitude: number;
  speed?: number | null;
  heading?: number | null;
  engine_status?: string | null;
}

export const getLatestGpsData = async (): Promise<GpsDataWithVehicle[]> => {
  const { data, error } = await supabase
    .from('gps_data')
    .select('*, vehicles(*)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching GPS data:', error);
    throw error;
  }

  const latestByVehicle: Record<string, GpsDataWithVehicle> = {};
  
  data.forEach((item) => {
    const vehicleId = item.vehicle_id;
    if (!vehicleId) return;
    
    if (!latestByVehicle[vehicleId] || 
        new Date(item.created_at) > new Date(latestByVehicle[vehicleId].created_at)) {
      latestByVehicle[vehicleId] = item as unknown as GpsDataWithVehicle;
    }
  });

  return Object.values(latestByVehicle);
};

export const insertGpsData = async (gpsData: GpsDataInsert) => {
  const { data, error } = await supabase
    .from('gps_data')
    .insert(gpsData)
    .select()
    .single();

  if (error) {
    console.error('Error inserting GPS data:', error);
    throw error;
  }

  return data;
};

export const getGpsDataByVehicle = async (vehicleId: string) => {
  const { data, error } = await supabase
    .from('gps_data')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching GPS data for vehicle:', error);
    throw error;
  }

  return data;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const subscribeToGpsUpdates = (callback: (payload: any) => void) => {
  return supabase
    .channel('gps_data_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'gps_data'
      },
      callback
    )
    .subscribe();
};
