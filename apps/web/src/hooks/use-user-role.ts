import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';

export const useUserRole = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['userRole', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      // Try to get role from user_roles table first
      const { data: userRoleData } = await supabase
        .from('user_roles')
        .select(`
          *,
          roles(id, name)
        `)
        .eq('user_id', user.id)
        .maybeSingle();

      if (userRoleData) {
        return userRoleData;
      }

      // Fallback: if no user_roles entry, get role from user metadata
      const roleId = user.user_metadata?.role_id;
      const branchId = user.user_metadata?.branch_id;

      if (!roleId) {
        console.error('No role_id found in user_metadata');
        return null;
      }

      // Query the roles table directly
      const { data: roleData, error: roleError } = await supabase
        .from('roles')
        .select('id, name')
        .eq('id', roleId)
        .single();

      if (roleError) {
        console.error('Error fetching role:', roleError);
        return null;
      }

      // Return data in the same format as user_roles query
      return {
        user_id: user.id,
        role_id: roleId,
        role: roleData.name,
        branch_id: branchId,
        roles: roleData
      };
    },
    enabled: !!user?.id
  });
};