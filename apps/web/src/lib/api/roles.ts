import { api } from './client.js';
import type { Role } from '../types';

// Shape of a role row as returned by GET /roles (Prisma camelCase).
interface RoleResponse {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

// Reshape the API's camelCase role row into the FE's snake_case Role type.
function toSnake(r: RoleResponse): Role {
  return { id: r.id, name: r.name, description: r.description, created_at: r.createdAt };
}

// Fetch all roles, sorted by name (server-side).
export const getRoles = async (): Promise<Role[]> => {
  const res = await api.get<{ data: RoleResponse[]; count: number }>('/roles');
  return res.data.map(toSnake);
};

// Fetch a single role by id (no single-role endpoint; filter the full list).
export const getRoleById = async (id: string): Promise<Role> => {
  const roles = await getRoles();
  const role = roles.find((r) => r.id === id);
  if (!role) throw new Error(`Role not found: ${id}`);
  return role;
};

// Fetch a role by name, returning null when not found (preserves the old
// Supabase "PGRST116 -> null" not-found contract).
export const getRoleByName = async (name: string): Promise<Role | null> => {
  const roles = await getRoles();
  return roles.find((r) => r.name === name) ?? null;
};
