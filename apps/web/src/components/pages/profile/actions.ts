import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

// Exactly the fields PATCH /users/me accepts (UpdateOwnProfileBody) plus the
// avatar file part. Role, status and branch are absent on purpose: they decide
// what a user is allowed to do, so only an admin may write them — a form field
// for them here would be a lie.
export const profileSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string(),
  address: z.string(),
  avatar: z.instanceof(FileList).optional()
});

export type ProfileFormData = z.infer<typeof profileSchema>;

export const useProfileForm = () => {
  return useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: '',
      phone: '',
      address: ''
    }
  });
};

// The current password is required by the server for a self-change, and the
// 8-character minimum mirrors changePasswordBodySchema so the round trip isn't
// spent learning a rule we already know.
export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your new password')
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  });

export type PasswordFormData = z.infer<typeof passwordSchema>;

export const usePasswordForm = () => {
  return useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    }
  });
};
