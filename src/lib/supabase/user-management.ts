import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '.';
import { signUp as authSignUp } from './auth';

export const signUp = async (
  email: string,
  password: string,
  fullName: string,
  role: string
): Promise<{ user: User; session: Session | null }> => {
  return await authSignUp(email, password, fullName, role);
};

export const getAllAdmins = async () => {
  const { data, error } = await supabase.from('admins').select('*');
  if (error) {
    console.error('Error fetching admins:', error);
    throw error;
  }
  return data;
};
