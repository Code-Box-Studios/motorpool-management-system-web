import { api } from './client.js';
import type { Branch } from '../types';

// Shape of a branch row as returned by GET /branches (Prisma camelCase; the
// model tracks no timestamp columns).
interface BranchResponse {
  id: string;
  name: string;
  location: string | null;
  archivedAt: string | null;
}

// Reshape the API's branch row into the FE's snake_case Branch type. The API
// doesn't track a branch timestamp; the FE column is nullable, so set it null.
function toSnake(b: BranchResponse): Branch {
  return {
    id: b.id,
    name: b.name,
    location: b.location,
    updated_at: null,
    archived_at: b.archivedAt
  };
}

// Defaults to active-only, which is what all ten existing call sites want —
// their dropdowns must stop offering archived branches.
export const getAllBranches = async (
  includeArchived = false
): Promise<Branch[]> => {
  const res = await api.get<{ data: BranchResponse[]; count: number }>(
    '/branches',
    includeArchived ? { includeArchived: 'true' } : undefined
  );
  return res.data.map(toSnake);
};
