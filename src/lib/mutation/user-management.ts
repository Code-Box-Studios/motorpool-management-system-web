// src/lib/mutation/user-management.ts
import { toast } from 'sonner';
import { signUp } from '../supabase/user-management'; // Added createAdmin and assignUserRole
import { useMutation } from '@tanstack/react-query';

export const useSignUp = () => {
  return useMutation({
    mutationFn: async ({
      email,
      password,
      fullName,
      role
    }: {
      email: string;
      password: string;
      fullName: string;
      role: string;
    }) => {
      const { user, session } = await signUp(email, password, fullName, role);
      if (user) {
        toast.success('User created successfully!');
      }
      return { user, session };
    },
    onSuccess: () => {
    },
    onError: (error) => {
      toast.error(`Sign up failed: ${error.message}`);
      console.error('Mutation error:', error);
    }
  });
};

