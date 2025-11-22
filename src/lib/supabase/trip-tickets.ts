import { supabase } from '.';
import type { TripTicket, NewTripTicket, UpdateTripTicket,  } from '../types';

export const getTripTickets = async (
  page: number = 1,
  limit: number = 10
): Promise<{ data: TripTicket[]; count: number | null }> => {
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data, error, count } = await supabase
    .from('trip_tickets')
    .select('*', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, to);
  if (error) {
    console.error('Error fetching trip tickets:', error);
    throw error;
  }
  return { data: data as TripTicket[], count };
};

export const getAllTripTickets = async (): Promise<TripTicket[]> => {
  const { data, error } = await supabase
    .from('trip_tickets')
    .select('*')
    .order('pickup_date_time', { ascending: false });
  if (error) {
    console.error('Error fetching all trip tickets:', error);
    throw error;
  }
  return data as TripTicket[];
};

export const getTripTicketById = async (id: string): Promise<TripTicket> => {
  const { data, error } = await supabase
    .from('trip_tickets')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    console.error('Error fetching trip ticket:', error);
    throw error;
  }
  return data as TripTicket;
};


export const createTripTicket = async (
  tripTicket: NewTripTicket
): Promise<TripTicket> => {
  try {
    const cleanedTripTicket = {
      ...tripTicket,
      driver_id: tripTicket.driver_id === '' ? null : tripTicket.driver_id,
      vehicle_id: tripTicket.vehicle_id === '' ? null : tripTicket.vehicle_id,
      approved_by: tripTicket.approved_by === '' ? null : tripTicket.approved_by,
      pre_trip_guard: tripTicket.pre_trip_guard === '' ? null : tripTicket.pre_trip_guard,
      post_trip_guard: tripTicket.post_trip_guard === '' ? null : tripTicket.post_trip_guard,
      remarks: tripTicket.remarks === '' ? null : tripTicket.remarks,
      allocation_date: tripTicket.allocation_date === '' ? null : tripTicket.allocation_date,
      allocation_trip_to: tripTicket.allocation_trip_to === '' ? null : tripTicket.allocation_trip_to,
      allocation_purpose: tripTicket.allocation_purpose === '' ? null : tripTicket.allocation_purpose,
      allocation_vehicle_id: tripTicket.allocation_vehicle_id === '' ? null : tripTicket.allocation_vehicle_id,
      allocation_km: tripTicket.allocation_km ?? null,
      allocation_liters: tripTicket.allocation_liters ?? null,
      allocation_fuel_type: tripTicket.allocation_fuel_type === '' ? null : tripTicket.allocation_fuel_type,
      allocation_requested_by: tripTicket.allocation_requested_by === '' ? null : tripTicket.allocation_requested_by,
      allocation_approved_by_evp_operations: tripTicket.allocation_approved_by_evp_operations === '' ? null : tripTicket.allocation_approved_by_evp_operations,
      allocation_status: tripTicket.allocation_status || 'pending'
    };

    const { data, error } = await supabase
      .from('trip_tickets')
      .insert(cleanedTripTicket)
      .select()
      .single();

    if (error) {
      console.error('Error creating trip ticket:', error);
      throw error;
    }

    return data as TripTicket;
  } catch (error) {
    console.error('Error in createTripTicket:', error);
    throw error;
  }
};

export const updateTripTicket = async (
  id: string,
  updates: UpdateTripTicket
): Promise<TripTicket> => {
  try {
    const cleanedUpdates = {
      ...updates,
      driver_id: updates.driver_id === '' ? null : updates.driver_id,
      vehicle_id: updates.vehicle_id === '' ? null : updates.vehicle_id,
      approved_by: updates.approved_by === '' ? null : updates.approved_by,
      pre_trip_guard: updates.pre_trip_guard === '' ? null : updates.pre_trip_guard,
      post_trip_guard: updates.post_trip_guard === '' ? null : updates.post_trip_guard,
      remarks: updates.remarks === '' ? null : updates.remarks,
      allocation_date: updates.allocation_date === '' ? null : updates.allocation_date,
      allocation_trip_to: updates.allocation_trip_to === '' ? null : updates.allocation_trip_to,
      allocation_purpose: updates.allocation_purpose === '' ? null : updates.allocation_purpose,
      allocation_vehicle_id: updates.allocation_vehicle_id === '' ? null : updates.allocation_vehicle_id,
      allocation_km: updates.allocation_km ?? null,
      allocation_liters: updates.allocation_liters ?? null,
      allocation_fuel_type: updates.allocation_fuel_type === '' ? null : updates.allocation_fuel_type,
      allocation_requested_by: updates.allocation_requested_by === '' ? null : updates.allocation_requested_by,
      allocation_approved_by_evp_operations: updates.allocation_approved_by_evp_operations === '' ? null : updates.allocation_approved_by_evp_operations
    };

    const { data, error } = await supabase
      .from('trip_tickets')
      .update(cleanedUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating trip ticket:', error);
      throw error;
    }

    const fuelAllocationUpdates = {
      date: updates.allocation_date === '' ? null : updates.allocation_date,
      trip_to: updates.allocation_trip_to === '' ? null : updates.allocation_trip_to,
      purpose: updates.allocation_purpose === '' ? null : updates.allocation_purpose,
      vehicle_id: updates.allocation_vehicle_id === '' ? null : updates.allocation_vehicle_id,
      km: updates.allocation_km ?? null,
      liters: updates.allocation_liters ?? null,
      fuel_type: updates.allocation_fuel_type === '' ? null : updates.allocation_fuel_type,
      requested_by: updates.allocation_requested_by === '' ? null : updates.allocation_requested_by,
      approved_by_evp_operations: updates.allocation_approved_by_evp_operations === '' ? null : updates.allocation_approved_by_evp_operations,
      status: updates.allocation_status || 'pending'
    };

    const { data: existingFuel } = await supabase
      .from('fuel_allocations')
      .select('id')
      .eq('trip_ticket_id', id)
      .single();

    if (existingFuel) {
      const { error: fuelUpdateError } = await supabase
        .from('fuel_allocations')
        .update({ ...fuelAllocationUpdates, updated_at: new Date().toISOString() })
        .eq('trip_ticket_id', id);

      if (fuelUpdateError) {
        console.error('Error updating fuel allocation:', fuelUpdateError);
        throw fuelUpdateError;
      }
    } else {
      const { error: fuelInsertError } = await supabase
        .from('fuel_allocations')
        .insert({
          trip_ticket_id: id,
          ...fuelAllocationUpdates,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (fuelInsertError) {
        console.error('Error inserting fuel allocation:', fuelInsertError);
        throw fuelInsertError;
      }
    }

    return data as TripTicket;
  } catch (error) {
    console.error('Error in updateTripTicket:', error);
    throw error;
  }
};
