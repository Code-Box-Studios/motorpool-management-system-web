import { supabase } from '.';

export const getDrivers = async (page: number = 1, limit: number = 10) => {
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
  return { data, count };
};

export const getDriverById = async (id: string) => {
  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    console.error('Error fetching driver:', error);
    throw error;
  }
  return data;
};

export const createDriver = async (driver: {
  full_name: string;
  date_of_birth?: string;
  address?: string;
  phone?: string;
  email?: string;
  license_number: string;
  license_type?: string;
  license_expiry?: string;
  sss_number?: string;
  tin?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  hire_date?: string;
  status?: string;
  assigned_vehicle_id?: string;
  notes?: string;
}) => {
  const { data, error } = await supabase.from('drivers').insert(driver);
  if (error) {
    console.error('Error creating driver:', error);
    throw error;
  }
  return data;
};

export const updateDriver = async (
  id: string,
  updates: Partial<(typeof createDriver.arguments)[0]>
) => {
  const { data, error } = await supabase
    .from('drivers')
    .update(updates)
    .eq('id', id);
  if (error) {
    console.error('Error updating driver:', error);
    throw error;
  }
  return data;
};

export const deleteDriver = async (id: string) => {
  const { data, error } = await supabase.from('drivers').delete().eq('id', id);
  if (error) {
    console.error('Error deleting driver:', error);
    throw error;
  }
  return data;
};
