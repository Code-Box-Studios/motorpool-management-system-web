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

// Update a user's profile, role, branch, status and (optionally) avatar.
// Multipart to match the API (avatarUpload.single('avatar') + validateBody).
export const useUpdateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      fullName,
      status,
      roleId,
      branchId,
      avatarFile
    }: {
      id: string;
      fullName: string;
      status: 'active' | 'inactive';
      roleId: string;
      branchId?: string;
      avatarFile?: File;
    }) => {
      const formData = new FormData();
      formData.append('fullName', fullName);
      formData.append('status', status);
      if (roleId) formData.append('roleId', roleId);
      if (branchId) formData.append('branchId', branchId);
      if (avatarFile) formData.append('avatar', avatarFile);

      const user = await api.patchForm<UserResponse>(`/users/${id}`, formData);
      toast.success('User updated');
      return user;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allUsers'] });
      queryClient.invalidateQueries({ queryKey: ['admins'] });
    },
    onError: (error) => {
      toast.error(`Update failed: ${error.message}`);
    }
  });
};

// Set a user's password. Admin resetting ANOTHER user needs no current password;
// changing your OWN requires it (the API enforces this). A change signs the
// target out everywhere.
export const useChangeUserPassword = () => {
  return useMutation({
    mutationFn: async ({
      id,
      newPassword,
      currentPassword
    }: {
      id: string;
      newPassword: string;
      currentPassword?: string;
    }) => {
      await api.patch(`/users/${id}/password`, {
        newPassword,
        ...(currentPassword ? { currentPassword } : {})
      });
      toast.success('Password updated');
    },
    onError: (error) => {
      toast.error(`Password change failed: ${error.message}`);
    }
  });
};

// Delete a user. The API refuses self-deletion and returns a friendly 409
// ("deactivate instead") when the user is referenced by existing records —
// both surface through the error toast.
export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.del<void>(`/users/${id}`);
      toast.success('User deleted');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allUsers'] });
      queryClient.invalidateQueries({ queryKey: ['admins'] });
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });
};
