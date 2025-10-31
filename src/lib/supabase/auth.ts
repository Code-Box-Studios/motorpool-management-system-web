import { AuthError } from '@supabase/supabase-js';
import { supabase } from '.';

export const signIn = async (
  email: string,
  password: string
): Promise<void> => {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error as AuthError;
};

export const signUp = async (
  email: string,
  password: string
): Promise<void> => {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error as AuthError;
};

export const signOut = async (): Promise<void> => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error as AuthError;
};

export const resetPassword = async (email: string): Promise<void> => {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error as AuthError;
};
