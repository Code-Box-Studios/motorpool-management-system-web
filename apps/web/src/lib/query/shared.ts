import { useQuery } from '@tanstack/react-query';
import { getAllBranches, getEmployees } from '../api/shared';

// Active branches only — the list every PICKER reads. A dropdown must never
// offer a branch that has been archived.
export const useBranches = () => {
  return useQuery({
    queryKey: ['branches'],
    queryFn: () => getAllBranches()
  });
};

// DISPLAY ONLY — archived branches included, under its own key so it never
// collides with the picker list above.
//
// A trip ticket, job order or user row stores a bare branch_id and resolves the
// name client-side against this list; the API embeds no branch object on those
// payloads. Read through the active-only list, archiving a branch silently
// blanks its name on every historical record that points at it — which is
// exactly the guarantee this feature exists to keep ("a trip ticket filed under
// a closed branch still displays that branch's name", design §1/§7).
//
// NEVER populate a form control from this hook. Use useBranches() for that.
export const useBranchesForDisplay = () => {
  return useQuery({
    queryKey: ['branches', 'all'],
    queryFn: () => getAllBranches(true)
  });
};

// Active employees only — the roster every guide PICKER reads, narrowed to one
// branch because a guide belongs to the trip's own branch (design §5.2). The
// branch id is part of the key, so switching branches on the booking form
// fetches that branch's roster instead of being served the previous one.
//
// The key stays under the ['employees'] prefix so the Organization tab's
// invalidation (lib/mutation/organization.ts) reaches it: TanStack matches
// prefixes, so invalidating ['employees'] refreshes every branch's list AND
// the display twin below. Without that branch in useOrgInvalidation, renaming
// or archiving an employee leaves this picker stale indefinitely.
export const useEmployees = (branchId?: string) => {
  return useQuery({
    queryKey: ['employees', branchId],
    queryFn: () => getEmployees(branchId)
  });
};
