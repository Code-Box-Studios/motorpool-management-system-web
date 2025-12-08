import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '.';
import { signUp as authSignUp } from './auth';

export const signUp = async (
  email: string,
  password: string,
  fullName: string,
  roleId: string,
  branchId: string,
  avatarUrl?: string
): Promise<{ user: User; session: Session | null }> => {
  return await authSignUp(email, password, fullName, roleId, branchId, avatarUrl);
};

export const getAllAdmins = async () => {
  const { data, error } = await supabase.from('admins').select('*');
  if (error) {
    console.error('Error fetching admins:', error);
    throw error;
  }
  return data;
};
