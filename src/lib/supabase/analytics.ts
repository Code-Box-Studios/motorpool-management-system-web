import { supabase } from '.';
import type { Vehicle, Maintenance } from '../types';

/**
 * Fetch all vehicles with their full maintenance history for predictive analysis.
 */
export const getVehiclesWithMaintenanceHistory = async (): Promise<{
  vehicles: Vehicle[];
  maintenances: Maintenance[];
}> => {
  const [vehiclesResult, maintenancesResult] = await Promise.all([
    supabase.from('vehicles').select('*'),
    supabase.from('maintenance').select('*').order('date', { ascending: false })
  ]);

  if (vehiclesResult.error) {
    console.error('Error fetching vehicles:', vehiclesResult.error);
    throw vehiclesResult.error;
  }

  if (maintenancesResult.error) {
    console.error('Error fetching maintenances:', maintenancesResult.error);
    throw maintenancesResult.error;
  }

  return {
    vehicles: vehiclesResult.data as Vehicle[],
    maintenances: maintenancesResult.data as Maintenance[]
  };
};

/**
 * Fetch all job orders with spare parts used, along with spare part details,
 * for association rule mining.
 */
export const getJobOrdersWithSpareParts = async (): Promise<{
  jobOrders: Array<{
    id: string;
    vehicle_id: string;
    spare_parts_used: string[] | null;
    vehicles: { make: string; model: string } | null;
  }>;
  spareParts: Array<{ id: string; name: string }>;
}> => {
  const [jobOrdersResult, sparePartsResult] = await Promise.all([
    supabase
      .from('job_orders')
      .select('id, vehicle_id, spare_parts_used, vehicles(make, model)')
      .not('spare_parts_used', 'is', null),
    supabase.from('spare_parts').select('id, name')
  ]);

  if (jobOrdersResult.error) {
    console.error('Error fetching job orders:', jobOrdersResult.error);
    throw jobOrdersResult.error;
  }

  if (sparePartsResult.error) {
    console.error('Error fetching spare parts:', sparePartsResult.error);
    throw sparePartsResult.error;
  }

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jobOrders: jobOrdersResult.data as any[],
    spareParts: sparePartsResult.data as Array<{ id: string; name: string }>
  };
};

/**
 * Fetch vehicle counts by status for dashboard metrics.
 */
export const getVehicleStatusCounts = async (): Promise<{
  available: number;
  underMaintenance: number;
  onTrip: number;
  outOfService: number;
  total: number;
}> => {
  const { data, error } = await supabase.from('vehicles').select('status');

  if (error) {
    console.error('Error fetching vehicle statuses:', error);
    throw error;
  }

  const counts = {
    available: 0,
    underMaintenance: 0,
    onTrip: 0,
    outOfService: 0,
    total: data.length
  };

  for (const v of data) {
    switch (v.status) {
      case 'available':
        counts.available++;
        break;
      case 'under_maintenance':
        counts.underMaintenance++;
        break;
      case 'on_trip':
        counts.onTrip++;
        break;
      case 'out_of_service':
        counts.outOfService++;
        break;
    }
  }

  return counts;
};

/**
 * Get count of completed trips.
 */
export const getCompletedTripsCount = async (): Promise<number> => {
  const { count, error } = await supabase
    .from('trip_tickets')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed');

  if (error) {
    console.error('Error fetching completed trips count:', error);
    throw error;
  }

  return count ?? 0;
};
