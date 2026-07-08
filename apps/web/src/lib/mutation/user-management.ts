// src/lib/mutation/user-management.ts
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UserResponse } from '@mms/shared';
import { api } from '../api/client';

export const useSignUp = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      email,
      password,
      fullName,
      role_id,
      branch_id,
      avatarFile
    }: {
      email: string;
      password: string;
      fullName: string;
      role_id: string;
      branch_id: string;
      avatarFile?: File;
    }) => {
      // Single multipart POST: text fields + the optional avatar file part.
      const formData = new FormData();
      formData.append('email', email);
      formData.append('password', password);
      formData.append('fullName', fullName);
      formData.append('roleId', role_id);
      formData.append('branchId', branch_id);
      if (avatarFile) formData.append('avatar', avatarFile);

      const user = await api.postForm<UserResponse>('/users', formData);
      toast.success('User created successfully!');
      return user;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allUsers'] });
      queryClient.invalidateQueries({ queryKey: ['admins'] }); // used for name resolution
    },
    onError: (error) => {
      toast.error(`Sign up failed: ${error.message}`);
      console.error('Mutation error:', error);
    }
  });
};
