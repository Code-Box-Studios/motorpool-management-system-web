// src/lib/supabase/auth.ts
import { AuthError, type Session, type User } from '@supabase/supabase-js';
import { supabase } from '.';

export const signIn = async (
  email: string,
  password: string
): Promise<User> => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error as AuthError;
  if (!data.user) throw new Error('No user data returned');
  return data.user;
};

export const signUp = async (
  email: string,
  password: string,
  fullName: string,
  roleId: string,
  branchId: string,
  avatarUrl?: string
): Promise<{ user: User; session: Session | null }> => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { 
        full_name: fullName, 
        role_id: roleId,
        branch_id: branchId,
        avatar_url: avatarUrl || null
      },
    },
  });
  if (error) throw error as AuthError;
  if (!data.user) throw new Error('No user data returned');
  return { user: data.user, session: data.session };
};

export const signOut = async (): Promise<void> => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error as AuthError;
};

export const resetPassword = async (email: string): Promise<void> => {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error as AuthError;
};

export const getCurrentUser = async (): Promise<User | null> => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error as AuthError;
  return user;
};
