import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { supabase } from './supabase';
import type { UserMetadata } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Get the user role name from metadata, handling both new and legacy formats
 * @param userMetadata - The user metadata object from Supabase auth
 * @returns Promise resolving to the role name string or null
 */
export async function getUserRoleName(userMetadata: UserMetadata | null | undefined): Promise<string | null> {
  // First, check if the role name is directly available in metadata
  if (userMetadata?.role) {
    return userMetadata.role;
  }

  // If not, check if we have a role_id and look up the role name
  if (userMetadata?.role_id) {
    try {
      const { data: roleData, error } = await supabase
        .from('roles')
        .select('name')
        .eq('id', userMetadata.role_id)
        .single();

      if (!error && roleData) {
        return roleData.name;
      }
    } catch (error) {
      console.error('Error fetching role name from role_id:', error);
    }
  }

  return null;
}
