import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  archiveOrgRecord,
  createOrgRecord,
  restoreOrgRecord,
  updateOrgRecord,
  type CreateOrgBody,
  type OrgResource,
  type UpdateOrgBody
} from '@/lib/api/organization';
import type { ApiError } from '@/lib/api/client';

const LABELS: Record<OrgResource, string> = {
  branches: 'Branch',
  offices: 'Office',
  'office-heads': 'Office head'
};

function useOrgInvalidation(resource: OrgResource) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['organization', resource] });
    // Every other dropdown in the app reads its own, differently-keyed query
    // rather than this admin list, so each has to be told separately that an
    // archive/restore/create/update here made its cache stale — otherwise the
    // "gone from every dropdown" guarantee only actually holds for branches.
    //
    // These invalidations are PREFIX matches (TanStack's default is
    // exact: false), which is what carries the archived-inclusive display
    // twins with them: ['branches'] also invalidates ['branches', 'all'], and
    // ['departmentOffices'] also invalidates ['departmentOffices', 'all'].
    // That is load-bearing, not incidental — those twins are what render a
    // branch/office name on a historical trip ticket, job order or user row,
    // so a rename here has to reach them too, not just the pickers. Naming the
    // twins again below would be a no-op; this comment is the guard against
    // someone re-keying them out from under the prefix.
    if (resource === 'branches') {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      // These two do NOT ride the prefix: the vehicle and user tables embed
      // branch NAMES resolved at fetch time (lib/api/vehicles.ts,
      // lib/api/user-management.ts), under keys of their own. Without these,
      // renaming a branch leaves both tables showing the old name until
      // something else happens to refetch them.
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['allUsers'] });
    }
    if (resource === 'offices')
      queryClient.invalidateQueries({ queryKey: ['departmentOffices'] });
    if (resource === 'office-heads')
      queryClient.invalidateQueries({ queryKey: ['officeHeads'] });
  };
}

export const useCreateOrgRecord = (resource: OrgResource) => {
  const invalidate = useOrgInvalidation(resource);
  return useMutation({
    mutationFn: (body: CreateOrgBody) => createOrgRecord(resource, body),
    onSuccess: () => {
      toast.success(`${LABELS[resource]} created`);
      invalidate();
    },
    onError: (error: ApiError) =>
      toast.error(`Create failed: ${error?.message ?? String(error)}`)
  });
};

export const useUpdateOrgRecord = (resource: OrgResource) => {
  const invalidate = useOrgInvalidation(resource);
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateOrgBody }) =>
      updateOrgRecord(resource, id, body),
    onSuccess: () => {
      toast.success(`${LABELS[resource]} updated`);
      invalidate();
    },
    onError: (error: ApiError) =>
      toast.error(`Update failed: ${error?.message ?? String(error)}`)
  });
};

// No toast on error: a blocked archive is rendered inside the dialog with its
// blocker list, which a toast cannot show.
export const useArchiveOrgRecord = (resource: OrgResource) => {
  const invalidate = useOrgInvalidation(resource);
  return useMutation({
    mutationFn: (id: string) => archiveOrgRecord(resource, id),
    onSuccess: () => {
      toast.success(`${LABELS[resource]} archived`);
      invalidate();
    }
  });
};

export const useRestoreOrgRecord = (resource: OrgResource) => {
  const invalidate = useOrgInvalidation(resource);
  return useMutation({
    mutationFn: (id: string) => restoreOrgRecord(resource, id),
    onSuccess: () => {
      toast.success(`${LABELS[resource]} restored`);
      invalidate();
    },
    onError: (error: ApiError) =>
      toast.error(`Restore failed: ${error?.message ?? String(error)}`)
  });
};
