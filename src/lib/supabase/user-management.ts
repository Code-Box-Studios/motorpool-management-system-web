import type { AuthError } from '@supabase/supabase-js';
import { supabase } from '.';

export const signUp = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error as AuthError;
  return data;
};

export const createProfile = async (
  userId: string,
  fullName?: string,
  avatarUrl?: string
) => {
  const { data, error } = await supabase.from('profiles').insert({
    id: userId,
    full_name: fullName || null,
    avatar_url: avatarUrl || null
  });
  if (error) {
    console.error('Error creating profile:', error);
    throw error;
  }
  return data;
};

export const getAllProfiles = async () => {
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) {
    console.error('Error fetching profiles:', error);
    throw error;
  }
  return data;
};
