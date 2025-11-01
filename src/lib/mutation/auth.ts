import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner'; // Add toast import
import { resetPassword, signIn, signOut } from '../supabase/auth';

export const useSignIn = () => {
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signIn(email, password),
    onSuccess: () => {
      toast.success('Login successful!');
    },
    onError: (error) => {
      toast.error(`Login failed: ${error.message}`);
    }
  });
};

export const useSignOut = () => {
  return useMutation({
    mutationFn: () => signOut(),
    onSuccess: () => {
      toast.success('Signed out successfully!');
    },
    onError: (error) => {
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
    onError: (error) => {
      toast.error(`Password reset failed: ${error.message}`);
    }
  });
};
