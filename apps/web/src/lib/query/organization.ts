import { useQuery } from '@tanstack/react-query';
import { getOrgRecords, type OrgResource } from '../api/organization';

// The admin page is the only caller that wants archived rows, so the flag is
// baked in here rather than exposed as an argument.
const orgQuery = (resource: OrgResource) => ({
  queryKey: ['organization', resource],
  queryFn: () => getOrgRecords(resource, true)
});

export const useBranchesAdmin = () => useQuery(orgQuery('branches'));
export const useOfficesAdmin = () => useQuery(orgQuery('offices'));
export const useOfficeHeadsAdmin = () => useQuery(orgQuery('office-heads'));
