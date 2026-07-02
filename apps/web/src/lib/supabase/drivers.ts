// src/lib/supabase/drivers.ts
import { supabase } from '.';
import type { Driver, NewDriver, UpdateDriver } from '../types'; // Added types

export const getDrivers = async (page: number = 1, limit: number = 10): Promise<{ data: Driver[]; count: number | null }> => {
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data, error, count } = await supabase
    .from('drivers')
    .select('*', { count: 'exact' })
    .range(from, to);
  if (error) {
    console.error('Error fetching drivers:', error);
    throw error;
  }
  return { data: data as Driver[], count }; 
};

export const getDriverById = async (id: string): Promise<Driver> => {
  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    console.error('Error fetching driver:', error);
    throw error;
  }
  return data as Driver;
};

export const createDriver = async (driver: NewDriver): Promise<Driver> => {
  const { data, error } = await supabase
    .from('drivers')
    .insert(driver)
    .select()
    .single();
  if (error) {
    console.error('Error creating driver:', error);
    throw error;
  }
  return data as Driver;
};

export const updateDriver = async (
  id: string,
  updates: UpdateDriver 
): Promise<Driver> => {
  const { data, error } = await supabase
    .from('drivers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Error updating driver:', error);
    throw error;
  }
  return data as Driver;
};

export const deleteDriver = async (id: string): Promise<Driver> => { 
  const { data, error } = await supabase
    .from('drivers')
    .delete()
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Error deleting driver:', error);
    throw error;
  }
  return data as Driver;
};