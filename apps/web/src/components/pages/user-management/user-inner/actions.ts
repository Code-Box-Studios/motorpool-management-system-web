import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

// Mirrors the fields the API's updateUserBodySchema round-trips into the users
// list (fullName/status/role/branch/avatar). phone/address are intentionally
// omitted — the list response doesn't carry them, so editing them here would
// look like it silently did nothing.
export const updateUserSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  status: z.enum(['active', 'inactive']),
  role_id: z.string().uuid('Please select a role'),
  branch_id: z.string().uuid('Please select a branch'),
  avatar: z.instanceof(FileList).optional()
});

export type UpdateUserFormData = z.infer<typeof updateUserSchema>;

export const useUserUpdateForm = () => {
  return useForm<UpdateUserFormData>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      fullName: '',
      status: 'active',
      role_id: '',
      branch_id: ''
    }
  });
};
