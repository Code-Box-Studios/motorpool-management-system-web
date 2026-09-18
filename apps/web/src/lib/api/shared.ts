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

// Defaults to active-only, which is what every PICKER wants — their dropdowns
// must stop offering archived branches. Pass `true` only where a branch name
// has to be rendered against a historical record (see useBranchesForDisplay);
// an archived-inclusive list behind a form control would put a closed branch
// back on the menu.
export const getAllBranches = async (
  includeArchived = false
): Promise<Branch[]> => {
  const res = await api.get<{ data: BranchResponse[]; count: number }>(
    '/branches',
    includeArchived ? { includeArchived: 'true' } : undefined
  );
  return res.data.map(toSnake);
};

// Shape of an employee row as returned by GET /employees (Prisma camelCase).
//
// `phone` is optional because the API omits the key entirely for non-admin
// callers (organization/service.ts listEmployees) — the guide picker is open
// to every role but has no business reading staff phone numbers. Only the
// admin roster tab, which edits the field, ever sees it.
interface EmployeeResponse {
  id: string;
  name: string;
  position: string | null;
  phone?: string | null;
  branchId: string;
  archivedAt: string | null;
}

// The FE's snake_case employee row. Declared here rather than in
// types/supabase.ts for the same reason TripDateRow is declared in
// api/trip-tickets.ts: that file is the generated Supabase schema, and the
// API's newer tables were never added back to it.
export interface EmployeeRow {
  id: string;
  name: string;
  position: string | null;
  phone?: string | null;
  branch_id: string;
  archived_at: string | null;
}

function toSnakeEmployee(e: EmployeeResponse): EmployeeRow {
  return {
    id: e.id,
    name: e.name,
    position: e.position,
    phone: e.phone,
    branch_id: e.branchId,
    archived_at: e.archivedAt
  };
}

// A branch's staff roster — the list the trip form's guide picker reads.
//
// Defaults to active-only for the same reason getAllBranches does: a picker
// must stop offering someone who has been archived. `branchId` narrows it
// server-side because the picker is branch-locked (design §5.2); omitted, the
// whole roster comes back. Pass `true` only to render a guide's name against a
// historical ticket — the employee is embedded on the ticket payload.
export const getEmployees = async (
  branchId?: string,
  includeArchived = false
): Promise<EmployeeRow[]> => {
  const res = await api.get<{ data: EmployeeResponse[]; count: number }>(
    '/employees',
    {
      // buildUrl (api/client.ts:95-100) drops undefined/null/'' keys, so an
      // omitted branch is simply not sent rather than sent as "undefined".
      branchId,
      includeArchived: includeArchived ? 'true' : undefined
    }
  );
  return res.data.map(toSnakeEmployee);
};
