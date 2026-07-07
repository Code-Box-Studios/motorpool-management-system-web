import { api } from './client.js';
import type { Tables } from '../types/supabase';

type DepartmentOffice = Tables<'department_offices'>;
type OfficeHead = Tables<'office_heads'>;

// Shape of a department-office row as returned by GET /offices (Prisma
// camelCase; the API also embeds a `head` object we don't need here — the FE
// hook today returns a flat row, matched by this reshape).
interface OfficeResponse {
  id: string;
  name: string;
  branchId: string | null;
  headId: string | null;
  createdAt: string;
}

// Shape of an office-head row as returned by GET /office-heads (Prisma
// camelCase; the model tracks no timestamp columns).
interface OfficeHeadResponse {
  id: string;
  name: string;
  branchId: string | null;
  officeId: string | null;
}

// Reshape the API's department-office row into the FE's snake_case shape.
function toSnakeOffice(o: OfficeResponse): DepartmentOffice {
  return {
    id: o.id,
    name: o.name,
    branch_id: o.branchId,
    head_id: o.headId,
    created_at: o.createdAt,
    updated_at: null // the API doesn't track this column
  };
}

// Reshape the API's office-head row into the FE's snake_case shape. The API
// doesn't track office-head timestamps; both FE columns are nullable.
function toSnakeOfficeHead(h: OfficeHeadResponse): OfficeHead {
  return {
    id: h.id,
    name: h.name,
    branch_id: h.branchId,
    office_id: h.officeId,
    created_at: null,
    updated_at: null
  };
}

// Fetch all department offices, sorted by name (server-side).
export const getDepartmentOffices = async (): Promise<DepartmentOffice[]> => {
  const res = await api.get<{ data: OfficeResponse[]; count: number }>('/offices');
  return res.data.map(toSnakeOffice);
};

// Fetch all office heads, sorted by name (server-side).
export const getOfficeHeads = async (): Promise<OfficeHead[]> => {
  const res = await api.get<{ data: OfficeHeadResponse[]; count: number }>('/office-heads');
  return res.data.map(toSnakeOfficeHead);
};
