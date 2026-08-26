import { api, ApiError } from './client';
import type {
  CreateBranchBody,
  CreateOfficeBody,
  CreateOfficeHeadBody,
  UpdateBranchBody,
  UpdateOfficeBody,
  UpdateOfficeHeadBody
} from '@mms/shared';

// The three tabs are the same table with different columns, so one union keeps
// the mutation hooks from being written three times.
export type OrgResource = 'branches' | 'offices' | 'office-heads';

export interface OrgRecord {
  id: string;
  name: string;
  archivedAt: string | null;
  location?: string | null;
  branchId?: string | null;
  headId?: string | null;
  officeId?: string | null;
}

export type CreateOrgBody =
  | CreateBranchBody
  | CreateOfficeBody
  | CreateOfficeHeadBody;
export type UpdateOrgBody =
  | UpdateBranchBody
  | UpdateOfficeBody
  | UpdateOfficeHeadBody;

export interface ArchiveBlocker {
  resource: string;
  count: number;
}

// What the API means by each blocker key, singular and plural.
const BLOCKER_LABELS: Record<string, [string, string]> = {
  vehicles: ['vehicle', 'vehicles'],
  drivers: ['driver', 'drivers'],
  users: ['user', 'users'],
  departmentOffices: ['department office', 'department offices'],
  officeHeads: ['office head', 'office heads'],
  tripTickets: ['active trip ticket', 'active trip tickets'],
  jobOrders: ['open job order', 'open job orders']
};

export function blockersFrom(error: unknown): ArchiveBlocker[] {
  if (!(error instanceof ApiError) || error.code !== 'IN_USE') return [];
  const details = error.details as { blockers?: ArchiveBlocker[] } | undefined;
  return details?.blockers ?? [];
}

export function describeBlockers(blockers: ArchiveBlocker[]): string[] {
  return blockers.map(({ resource, count }) => {
    const labels = BLOCKER_LABELS[resource];
    // An unknown key is still worth showing — better a raw name than nothing.
    const label = labels ? (count === 1 ? labels[0] : labels[1]) : resource;
    return `${count} ${label}`;
  });
}

async function listResource(
  resource: OrgResource,
  includeArchived: boolean
): Promise<OrgRecord[]> {
  const res = await api.get<{ data: OrgRecord[]; count: number }>(
    `/${resource}`,
    includeArchived ? { includeArchived: 'true' } : undefined
  );
  return res.data;
}

export const getOrgRecords = (
  resource: OrgResource,
  includeArchived = true
): Promise<OrgRecord[]> => listResource(resource, includeArchived);

export const createOrgRecord = (
  resource: OrgResource,
  body: CreateOrgBody
): Promise<OrgRecord> => api.post<OrgRecord>(`/${resource}`, body);

export const updateOrgRecord = (
  resource: OrgResource,
  id: string,
  body: UpdateOrgBody
): Promise<OrgRecord> => api.patch<OrgRecord>(`/${resource}/${id}`, body);

export const archiveOrgRecord = (
  resource: OrgResource,
  id: string
): Promise<OrgRecord> => api.post<OrgRecord>(`/${resource}/${id}/archive`);

export const restoreOrgRecord = (
  resource: OrgResource,
  id: string
): Promise<OrgRecord> => api.post<OrgRecord>(`/${resource}/${id}/restore`);
