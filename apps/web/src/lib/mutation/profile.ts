// src/lib/mutation/profile.ts
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UpdateOwnProfileBody } from '@mms/shared';
import { updateOwnProfile } from '../api/profile';

// Changing your OWN password has no mutation of its own: it is the same
// PATCH /users/:id/password the admin screen already calls, and passing
// `currentPassword` is what makes it a self-change. Import
// `useChangeUserPassword` from './user-management' and hand it your own id.
// The server answers a wrong current password with 400
// INVALID_CURRENT_PASSWORD (never 401), so mistyping it does not trip the api
// client's refresh-on-401 gate and sign the user out.

// Self-service profile edit. Only the three fields UpdateOwnProfileBody carries
// are writable; the avatar rides along as a file part.
export const useUpdateOwnProfile = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      avatarFile,
      ...updates
    }: UpdateOwnProfileBody & { avatarFile?: File }) =>
      updateOwnProfile(updates, avatarFile),
    onSuccess: () => {
      toast.success('Profile updated');
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      // The same row is a line in the admin's user list (and the 'admins'
      // lookup that resolves "requested by" names) — refresh those too.
      queryClient.invalidateQueries({ queryKey: ['allUsers'] });
      queryClient.invalidateQueries({ queryKey: ['admins'] });
    },
    onError: (error) => {
      toast.error(`Update failed: ${error.message}`);
    }
  });
};
