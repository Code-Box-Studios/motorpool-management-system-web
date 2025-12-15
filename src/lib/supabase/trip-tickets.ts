import { supabase } from '.';
import type { TripTicket, NewTripTicket, UpdateTripTicket,  } from '../types';

export const getTripTickets = async (
  page: number = 1,
  limit: number = 10,
  userId?: string,
  branchId?: string
): Promise<{ data: TripTicket[]; count: number | null }> => {
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  let query = supabase
    .from('trip_tickets')
    .select('*', { count: 'exact' });
  
  // Filter by requested_by if userId is provided (for requester role)
  if (userId) {
    query = query.eq('requested_by', userId);
  }
  
  // Filter by branch_id if branchId is provided (for admin role)
  if (branchId) {
    query = query.eq('branch_id', branchId);
  }
  
  const { data, error, count } = await query
    .order('updated_at', { ascending: false })
    .range(from, to);
  if (error) {
    console.error('Error fetching trip tickets:', error);
    throw error;
  }
  return { data: data as TripTicket[], count };
};

export const getAllTripTickets = async (userId?: string, branchId?: string): Promise<TripTicket[]> => {
  let query = supabase
    .from('trip_tickets')
    .select('*');
  
  // Filter by requested_by if userId is provided (for requester role)
  if (userId) {
    query = query.eq('requested_by', userId);
  }
  
  // Filter by branch_id if branchId is provided (for admin role)
  if (branchId) {
    query = query.eq('branch_id', branchId);
  }
  
  const { data, error } = await query.order('start_ts', { ascending: false });
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
      remarks: tripTicket.remarks === '' ? null : tripTicket.remarks
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
    // Only include fields that are actually being updated
    const cleanedUpdates: any = {};
    
    if (updates.driver_id !== undefined) cleanedUpdates.driver_id = updates.driver_id === '' ? null : updates.driver_id;
    if (updates.vehicle_id !== undefined) cleanedUpdates.vehicle_id = updates.vehicle_id === '' ? null : updates.vehicle_id;
    if (updates.approved_by !== undefined) cleanedUpdates.approved_by = updates.approved_by === '' ? null : updates.approved_by;
    if (updates.pre_trip_guard !== undefined) cleanedUpdates.pre_trip_guard = updates.pre_trip_guard === '' ? null : updates.pre_trip_guard;
    if (updates.post_trip_guard !== undefined) cleanedUpdates.post_trip_guard = updates.post_trip_guard === '' ? null : updates.post_trip_guard;
    if (updates.remarks !== undefined) cleanedUpdates.remarks = updates.remarks === '' ? null : updates.remarks;
    if (updates.status !== undefined) cleanedUpdates.status = updates.status;
    if (updates.cancellation_reason !== undefined) cleanedUpdates.cancellation_reason = updates.cancellation_reason === '' ? null : updates.cancellation_reason;
    if (updates.disapproved_reason !== undefined) cleanedUpdates.disapproved_reason = updates.disapproved_reason === '' ? null : updates.disapproved_reason;
    if (updates.destination !== undefined) cleanedUpdates.destination = updates.destination;
    if (updates.purpose !== undefined) cleanedUpdates.purpose = updates.purpose;
    if (updates.date_requested !== undefined) cleanedUpdates.date_requested = updates.date_requested;
    if (updates.start_ts !== undefined) cleanedUpdates.start_ts = updates.start_ts;
    if (updates.end_ts !== undefined) cleanedUpdates.end_ts = updates.end_ts;
    if (updates.prepared_by !== undefined) cleanedUpdates.prepared_by = updates.prepared_by;
    if (updates.branch_id !== undefined) cleanedUpdates.branch_id = updates.branch_id;
    if (updates.office_id !== undefined) cleanedUpdates.office_id = updates.office_id === '' ? null : updates.office_id;
    if (updates.office_head_id !== undefined) cleanedUpdates.office_head_id = updates.office_head_id === '' ? null : updates.office_head_id;
    
    // Handle participants array conversion
    if (updates.participants !== undefined) {
      if (typeof updates.participants === 'string') {
        cleanedUpdates.participants = updates.participants
          .split(',')
          .map(p => p.trim())
          .filter(p => p.length > 0);
      } else {
        cleanedUpdates.participants = updates.participants;
      }
    }
    
    if (updates.allocation_date !== undefined) cleanedUpdates.allocation_date = updates.allocation_date === '' ? null : updates.allocation_date;
    if (updates.allocation_trip_to !== undefined) cleanedUpdates.allocation_trip_to = updates.allocation_trip_to === '' ? null : updates.allocation_trip_to;
    if (updates.allocation_purpose !== undefined) cleanedUpdates.allocation_purpose = updates.allocation_purpose === '' ? null : updates.allocation_purpose;
    if (updates.allocation_vehicle_id !== undefined) cleanedUpdates.allocation_vehicle_id = updates.allocation_vehicle_id === '' ? null : updates.allocation_vehicle_id;
    if (updates.allocation_km !== undefined) cleanedUpdates.allocation_km = updates.allocation_km;
    if (updates.allocation_liters !== undefined) cleanedUpdates.allocation_liters = updates.allocation_liters;
    if (updates.allocation_fuel_type !== undefined) cleanedUpdates.allocation_fuel_type = updates.allocation_fuel_type === '' ? null : updates.allocation_fuel_type;
    if (updates.allocation_requested_by !== undefined) cleanedUpdates.allocation_requested_by = updates.allocation_requested_by === '' ? null : updates.allocation_requested_by;
    if (updates.allocation_approved_by_evp_operations !== undefined) cleanedUpdates.allocation_approved_by_evp_operations = updates.allocation_approved_by_evp_operations === '' ? null : updates.allocation_approved_by_evp_operations;

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

    // Only update fuel allocation if allocation-related fields are being updated
    const hasAllocationUpdates = updates.allocation_date !== undefined ||
      updates.allocation_trip_to !== undefined ||
      updates.allocation_purpose !== undefined ||
      updates.allocation_vehicle_id !== undefined ||
      updates.allocation_km !== undefined ||
      updates.allocation_liters !== undefined ||
      updates.allocation_fuel_type !== undefined ||
      updates.allocation_requested_by !== undefined ||
      updates.allocation_approved_by_evp_operations !== undefined ||
      updates.allocation_status !== undefined;

    if (hasAllocationUpdates) {
      const fuelAllocationUpdates: any = {};
      
      if (updates.allocation_date !== undefined) fuelAllocationUpdates.date = updates.allocation_date === '' ? null : updates.allocation_date;
      if (updates.allocation_trip_to !== undefined) fuelAllocationUpdates.trip_to = updates.allocation_trip_to === '' ? null : updates.allocation_trip_to;
      if (updates.allocation_purpose !== undefined) fuelAllocationUpdates.purpose = updates.allocation_purpose === '' ? null : updates.allocation_purpose;
      if (updates.allocation_vehicle_id !== undefined) fuelAllocationUpdates.vehicle_id = updates.allocation_vehicle_id === '' ? null : updates.allocation_vehicle_id;
      if (updates.allocation_km !== undefined) fuelAllocationUpdates.km = updates.allocation_km;
      if (updates.allocation_liters !== undefined) fuelAllocationUpdates.liters = updates.allocation_liters;
      if (updates.allocation_fuel_type !== undefined) fuelAllocationUpdates.fuel_type = updates.allocation_fuel_type === '' ? null : updates.allocation_fuel_type;
      if (updates.allocation_requested_by !== undefined) fuelAllocationUpdates.requested_by = updates.allocation_requested_by === '' ? null : updates.allocation_requested_by;
      if (updates.allocation_approved_by_evp_operations !== undefined) fuelAllocationUpdates.approved_by_evp_operations = updates.allocation_approved_by_evp_operations === '' ? null : updates.allocation_approved_by_evp_operations;
      if (updates.allocation_status !== undefined) fuelAllocationUpdates.status = updates.allocation_status;

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
      } else if (updates.allocation_km !== undefined && updates.allocation_km !== null) {
        // Only insert new fuel allocation if km is provided (required field)
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
    }

    return data as TripTicket;
  } catch (error) {
    console.error('Error in updateTripTicket:', error);
    throw error;
  }
};

export const deleteTripTicket = async (id: string): Promise<void> => {
  try {
    // First, delete related fuel allocations
    const { error: fuelError } = await supabase
      .from('fuel_allocations')
      .delete()
      .eq('trip_ticket_id', id);

    if (fuelError) {
      console.error('Error deleting fuel allocations:', fuelError);
      throw fuelError;
    }

    // Then delete the trip ticket
    const { error } = await supabase
      .from('trip_tickets')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting trip ticket:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in deleteTripTicket:', error);
    throw error;
  }
};
