import type { UserResponse } from '@mms/shared';
import { api, toAssetUrl } from './client.js';
import { getAllBranches } from './shared.js';
import type { Admin, UserProfileData } from '../types';

// Title-cases a role name ("branch_manager" -> "Branch Manager"); 'N/A' when absent.
function formatRole(role: string | null): string {
  if (!role) return 'N/A';
  return role
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Reshape the API's camelCase user row (+ a branchId->name lookup) into the
// user-management table's UserProfileData shape. Typed return (no `as`) so
// tsc enforces every UserProfile column, including the ones the new API
// doesn't track (phone/address/date_of_birth/updated_at -> null).
function toUserProfileData(u: UserResponse, branchMap: Map<string, string>): UserProfileData {
  return {
    id: u.id,
    email: u.email,
    full_name: u.fullName,
    avatar_url: toAssetUrl(u.avatarUrl),
    status: u.status,
    branch_id: u.branchId,
    created_at: u.createdAt,
    updated_at: null,
    phone: null,
    address: null,
    date_of_birth: null,
    role: formatRole(u.role),
    branch_name: u.branchId ? (branchMap.get(u.branchId) ?? 'N/A') : 'N/A'
  };
}

// Fetch every user, reshaped for the user-management table (role label + branch name).
export const getAllUsers = async (): Promise<UserProfileData[]> => {
  const [res, branches] = await Promise.all([
    api.get<{ data: UserResponse[]; count: number }>('/users'),
    getAllBranches()
  ]);
  const branchMap = new Map(branches.map((b) => [b.id, b.name]));
  return res.data.map((u) => toUserProfileData(u, branchMap));
};

// Reshape a user row into the Admin shape (the API tracks no admin-specific timestamp).
function toAdmin(u: UserResponse): Admin {
  return { id: u.id, email: u.email, full_name: u.fullName, branch_id: u.branchId, updated_at: null };
}

// Fetch every user with the admin role (used to resolve "requested by"/"noted by" names).
export const getAllAdmins = async (): Promise<Admin[]> => {
  const res = await api.get<{ data: UserResponse[]; count: number }>('/users', { role: 'admin' });
  return res.data.map(toAdmin);
};
