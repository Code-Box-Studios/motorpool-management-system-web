// src/lib/mutation/user-management.ts
import { toast } from 'sonner';
import { signUp } from '../supabase/user-management';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '../supabase';

export const useSignUp = () => {
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
      let avatarUrl: string | undefined;

      // First, create the user
      const { user, session } = await signUp(email, password, fullName, role_id, branch_id);
      
      // Then, upload avatar if file is provided (now user is authenticated)
      if (avatarFile && user) {
        const fileExt = avatarFile.name.split('.').pop();
        const fileName = `${user.id}.${fileExt}`;
        const filePath = `user-avatars/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('um-mms')
          .upload(filePath, avatarFile, {
            upsert: true // Allow overwrite if user updates avatar later
          });

        if (uploadError) {
          console.error('Avatar upload error:', uploadError);
          toast.error('User created but avatar upload failed');
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('um-mms')
            .getPublicUrl(filePath);
          
          avatarUrl = publicUrl;

          // Update user metadata with avatar URL
          await supabase.auth.updateUser({
            data: { avatar_url: avatarUrl }
          });
        }
      }

      if (user) {
        toast.success('User created successfully!');
      }
      return { user, session, avatarUrl };
    },
    onSuccess: () => {
    },
    onError: (error) => {
      toast.error(`Sign up failed: ${error.message}`);
      console.error('Mutation error:', error);
    }
  });
};

