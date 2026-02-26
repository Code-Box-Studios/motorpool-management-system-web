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
  // First, look up the role name from the roles table
  const { data: roleData, error: roleError } = await supabase
    .from('roles')
    .select('name')
    .eq('id', roleId)
    .single();

  if (roleError) {
    console.error('Error fetching role:', roleError);
    throw new Error('Invalid role ID provided');
  }

  if (!roleData) {
    throw new Error('Role not found');
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { 
        full_name: fullName, 
        role_id: roleId,
        role: roleData.name, // Store the role name for access control
        branch_id: branchId,
        avatar_url: avatarUrl || null
      },
    },
  });
  if (error) throw error as AuthError;
  if (!data.user) throw new Error('No user data returned');

  const userId = data.user.id;

  const { error: profileUpsertError } = await supabase.from('user_profiles').upsert(
    {
      id: userId,
      full_name: fullName,
      email,
      branch_id: branchId,
      avatar_url: avatarUrl || null
    },
    { onConflict: 'id' }
  );

  if (profileUpsertError) {
    console.error('Error upserting user profile during sign up:', profileUpsertError);
  }

  const { error: userRoleUpsertError } = await supabase.from('user_roles').upsert(
    {
      user_id: userId,
      role_id: roleId,
      role: roleData.name,
      branch_id: branchId,
      avatar_url: avatarUrl || null
    },
    { onConflict: 'user_id' }
  );

  if (userRoleUpsertError) {
    console.error('Error upserting user role during sign up:', userRoleUpsertError);
  }

  if (roleData.name === 'driver') {
    const { error: driverUpsertError } = await supabase.from('drivers').upsert(
      {
        id: userId,
        full_name: fullName,
        email,
        branch_id: branchId,
        status: 'Active'
      },
      { onConflict: 'id' }
    );

    if (driverUpsertError) {
      console.error('Error upserting driver during sign up:', driverUpsertError);
    }
  }

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
