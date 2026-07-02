import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

export const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().min(1, 'Full name is required'),
  avatar: z.instanceof(FileList).optional(),
  role_id: z.string().uuid('Please select a role'),
  branch_id: z.string().uuid('Please select a branch')
});

export type SignupFormData = z.infer<typeof signupSchema>;

export const useSignupForm = () => {
  return useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: '',
      password: '',
      fullName: '',
      role_id: '',
      branch_id: ''
    }
  });
};