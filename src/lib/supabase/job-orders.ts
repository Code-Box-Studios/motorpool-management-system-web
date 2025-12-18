import { supabase } from '.';
import type { JobOrder, NewJobOrder, UpdateJobOrder } from '../types';

export const getJobOrders = async (
  page: number = 1,
  limit: number = 10
): Promise<{ data: any[]; count: number | null }> => {
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data, error, count } = await supabase
    .from('job_orders')
    .select(`
      *,
      vehicles(id, make, model, license_plate)
    `, { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, to);
  if (error) {
    console.error('Error fetching job orders:', error);
    throw error;
  }
  return { data: data as any[], count };
};

export const getJobOrderById = async (id: string): Promise<JobOrder> => {
  const { data, error } = await supabase
    .from('job_orders')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    console.error('Error fetching job order:', error);
    throw error;
  }
  return data as JobOrder;
};

export const createJobOrder = async (
  jobOrder: NewJobOrder
): Promise<JobOrder> => {
  try {
    const cleanedJobOrder = {
      ...jobOrder,
      vehicle_id: jobOrder.vehicle_id === '' ? null : jobOrder.vehicle_id,
      requested_by: jobOrder.requested_by === '' ? null : jobOrder.requested_by,
      approved_by: jobOrder.approved_by === '' ? null : jobOrder.approved_by,
      noted_by: jobOrder.noted_by === '' ? null : jobOrder.noted_by,
      assigned_mechanic: jobOrder.assigned_mechanic === '' ? null : jobOrder.assigned_mechanic,
      incident_details: jobOrder.incident_details === '' ? null : jobOrder.incident_details,
      remarks: jobOrder.remarks === '' ? null : jobOrder.remarks,
      date_of_request: jobOrder.date_of_request === '' ? null : jobOrder.date_of_request,
      date_approved: jobOrder.date_approved === '' ? null : jobOrder.date_approved,
      target_date: jobOrder.target_date === '' ? null : jobOrder.target_date,
      actual_date_of_release: jobOrder.actual_date_of_release === '' ? null : jobOrder.actual_date_of_release,
      repair_done: jobOrder.repair_done ?? null,
      status: jobOrder.status || 'pending'
    };

    const { data, error } = await supabase
      .from('job_orders')
      .insert(cleanedJobOrder)
      .select()
      .single();

    if (error) {
      console.error('Error creating job order:', error);
      throw error;
    }

    return data as JobOrder;
  } catch (error) {
    console.error('Error in createJobOrder:', error);
    throw error;
  }
};

export const updateJobOrder = async (
  id: string,
  updates: UpdateJobOrder
): Promise<JobOrder> => {
  try {
    const cleanedUpdates = {
      ...updates,
      vehicle_id: updates.vehicle_id === '' ? null : updates.vehicle_id,
      requested_by: updates.requested_by === '' ? null : updates.requested_by,
      approved_by: updates.approved_by === '' ? null : updates.approved_by,
      noted_by: updates.noted_by === '' ? null : updates.noted_by,
      assigned_mechanic: updates.assigned_mechanic === '' ? null : updates.assigned_mechanic,
      incident_details: updates.incident_details === '' ? null : updates.incident_details,
      remarks: updates.remarks === '' ? null : updates.remarks,
      date_of_request: updates.date_of_request === '' ? null : updates.date_of_request,
      date_approved: updates.date_approved === '' ? null : updates.date_approved,
      target_date: updates.target_date === '' ? null : updates.target_date,
      actual_date_of_release: updates.actual_date_of_release === '' ? null : updates.actual_date_of_release,
      repair_done: updates.repair_done ?? null
    };

    const { data, error } = await supabase
      .from('job_orders')
      .update(cleanedUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating job order:', error);
      throw error;
    }

    return data as JobOrder;
  } catch (error) {
    console.error('Error in updateJobOrder:', error);
    throw error;
  }
};
