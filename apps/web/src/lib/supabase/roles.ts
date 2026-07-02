import { supabase } from '.';
import type { Role } from '../types';

export const getRoles = async (): Promise<Role[]> => {
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .order('name', { ascending: true });
  
  if (error) {
    console.error('Error fetching roles:', error);
    throw error;
  }
  
  return data as Role[];
};

export const getRoleById = async (id: string): Promise<Role> => {
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) {
    console.error('Error fetching role:', error);
    throw error;
  }
  
  return data as Role;
};

export const getRoleByName = async (name: string): Promise<Role | null> => {
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .eq('name', name)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null;
    }
    console.error('Error fetching role by name:', error);
    throw error;
  }
  
  return data as Role;
};
