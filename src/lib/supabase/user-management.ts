import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '.';
import { signUp as authSignUp } from './auth';

export const signUp = async (
  email: string,
  password: string,
  fullName: string,
  roleId: string,
  branchId: string,
  avatarUrl?: string
): Promise<{ user: User; session: Session | null }> => {
  return await authSignUp(email, password, fullName, roleId, branchId, avatarUrl);
};

export const getAllAdmins = async () => {
  const { data, error } = await supabase.from('admins').select('*');
  if (error) {
    console.error('Error fetching admins:', error);
    throw error;
  }
  return data;
};

export const getAllUsers = async () => {
  // First, get all branches for lookup
  const { data: branches, error: branchesError } = await supabase
    .from('branches')
    .select('id, name');

  if (branchesError) {
    console.error('Error fetching branches:', branchesError);
  }

  // Create a lookup map for branches
  const branchMap = new Map(branches?.map(branch => [branch.id, branch.name]) || []);

  // Then get users
  const { data, error } = await supabase
    .from('user_profiles_with_roles_detailed')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching users:', error);
    throw error;
  }

  // Transform the data to extract role from auth sources and add branch name
  const transformedData = data?.map((user) => {
    const rolesDetailed = user.roles_detailed as Array<{
      id: string | null;
      name: string;
      source: string;
    }> | null;

    // Find role from auth.raw_user_meta_data_role_id first, then fallback to auth.raw_user_meta_data_role
    const authRole = rolesDetailed?.find(r => r.source === 'auth.raw_user_meta_data_role_id')?.name ||
                     rolesDetailed?.find(r => r.source === 'auth.raw_user_meta_data_role')?.name;

    // Format role: remove underscores and capitalize each word
    const formattedRole = authRole
      ? authRole
          .split('_')
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ')
      : 'N/A';

    return {
      ...user,
      role: formattedRole,
      branch_name: user.branch_id ? branchMap.get(user.branch_id) || 'N/A' : 'N/A'
    };
  });

  return transformedData;
};