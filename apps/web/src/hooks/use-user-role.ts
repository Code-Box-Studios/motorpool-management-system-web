import { useAuth } from '@/hooks/use-auth';

// Derives the current user's role/branch straight from the auth context —
// no query needed since the API's /auth/me response already carries them.
export const useUserRole = () => {
  const { user } = useAuth();
  const role = user?.user_metadata.role ?? null;
  // undefined (not null) — query hooks type branchId filters as `string | undefined`.
  const branchId = user?.user_metadata.branch_id ?? undefined;

  // Preserve the shape consumers read (data?.branch_id, data?.roles?.name).
  return {
    data: user
      ? { user_id: user.id, role, branch_id: branchId, roles: role ? { name: role } : null }
      : null,
    isLoading: false,
    isError: false
  };
};
