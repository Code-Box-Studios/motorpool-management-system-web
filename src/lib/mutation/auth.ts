// src/lib/mutation/auth.ts
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { signIn, signUp, signOut, resetPassword, getCurrentUser} from '../supabase/auth';
import type { AuthError } from '@supabase/supabase-js';

export const useSignIn = () => {
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signIn(email, password),
    onSuccess: () => {
      toast.success('Login successful!');
    },
    onError: (error: AuthError) => {
      toast.error(`Login failed: ${error.message}`);
    }
  });
};

export const useSignUp = () => {
  return useMutation({
    mutationFn: ({ email, password, fullName, roleId, branchId }: { email: string; password: string; fullName: string; roleId: string; branchId: string }) =>
      signUp(email, password, fullName, roleId, branchId),
    onSuccess: () => {
      toast.success('Sign up successful! Check your email for confirmation.');
    },
    onError: (error: AuthError) => {
      toast.error(`Sign up failed: ${error.message}`);
    }
  });
};

export const useSignOut = () => {
  return useMutation({
    mutationFn: () => signOut(),
    onSuccess: () => {
      toast.success('Signed out successfully!');
    },
    onError: (error: AuthError) => {
      toast.error(`Sign out failed: ${error.message}`);
    }
  });
};

export const useResetPassword = () => {
  return useMutation({
    mutationFn: ({ email }: { email: string }) => resetPassword(email),
    onSuccess: () => {
      toast.success('Password reset email sent!');
    },
    onError: (error: AuthError) => {
      toast.error(`Password reset failed: ${error.message}`);
    }
  });
};

export const useCurrentUser = () => {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: getCurrentUser,
  });
};
