import { toast } from 'sonner';
import { createProfile, signUp } from '../supabase/user-management';
import { useMutation } from '@tanstack/react-query';

export const useSignUp = () => {
  return useMutation({
    mutationFn: async ({
      email,
      password
    }: {
      email: string;
      password: string;
    }) => {
      const { user, session } = await signUp(email, password);
      return { user, session };
    },
    onError: (error) => {
      toast.error(`Sign up failed: ${error.message}`);
      console.error('Mutation error:', error);
    }
  });
};

export const useCreateProfile = () => {
  return useMutation({
    mutationFn: ({
      userId,
      fullName,
      avatarUrl
    }: {
      userId: string;
      fullName?: string;
      avatarUrl?: string;
    }) => createProfile(userId, fullName, avatarUrl),
    onError: (error) => {
      toast.error(`Profile creation failed: ${error.message}`);
    }
  });
};
