import { supabase } from '.';
import type { Maintenance, NewMaintenance, UpdateMaintenance } from '../types';

export const getMaintenances = async (
  page: number = 1,
  limit: number = 10
): Promise<{ data: Maintenance[]; count: number | null }> => {
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data, error, count } = await supabase
    .from('maintenance')
    .select('*', { count: 'exact' })
    .order('date', { ascending: false })
    .range(from, to);
  if (error) {
    console.error('Error fetching maintenance records:', error);
    throw error;
  }
  return { data: data as Maintenance[], count };
};

export const getAllMaintenances = async (): Promise<Maintenance[]> => {
  const { data, error } = await supabase
    .from('maintenance')
    .select('*')
    .order('date', { ascending: false });
  if (error) {
    console.error('Error fetching all maintenance records:', error);
    throw error;
  }
  return data as Maintenance[];
};

export const getMaintenanceById = async (id: string): Promise<Maintenance> => {
  const { data, error } = await supabase
    .from('maintenance')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    console.error('Error fetching maintenance record:', error);
    throw error;
  }
  return data as Maintenance;
};

export const createMaintenance = async (
  maintenance: NewMaintenance
): Promise<Maintenance> => {
  try {
    const cleanedMaintenance = {
      ...maintenance,
      vehicle_id: maintenance.vehicle_id === '' ? null : maintenance.vehicle_id,
      description: maintenance.description === '' ? null : maintenance.description,
      next_due: maintenance.next_due === '' ? null : maintenance.next_due
    };

    const { data, error } = await supabase
      .from('maintenance')
      .insert(cleanedMaintenance)
      .select()
      .single();

    if (error) {
      console.error('Error creating maintenance record:', error);
      throw error;
    }

    return data as Maintenance;
  } catch (error) {
    console.error('Error in createMaintenance:', error);
    throw error;
  }
};

export const updateMaintenance = async (
  id: string,
  updates: UpdateMaintenance
): Promise<Maintenance> => {
  try {
    const cleanedUpdates = {
      ...updates,
      vehicle_id: updates.vehicle_id === '' ? null : updates.vehicle_id,
      description: updates.description === '' ? null : updates.description,
      next_due: updates.next_due === '' ? null : updates.next_due
    };

    const { data, error } = await supabase
      .from('maintenance')
      .update(cleanedUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating maintenance record:', error);
      throw error;
    }

    return data as Maintenance;
  } catch (error) {
    console.error('Error in updateMaintenance:', error);
    throw error;
  }
};
