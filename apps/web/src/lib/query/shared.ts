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
// prefixes, so invalidating ['employees'] refreshes every branch's list.
//
// What that invalidation is and is not worth: main.tsx builds a bare
// `new QueryClient()` and this hook sets no `staleTime`, so the library
// defaults apply (staleTime 0, refetchOnMount true) and a picker MOUNTED after
// the edit refetches on its own. The invalidation branch matters for a picker
// that is ALREADY MOUNTED — a booking dialog left open while someone edits the
// roster in another tab — and it becomes the whole guarantee the day anyone
// adds a `staleTime` here or a `defaultOptions` there. It is cheap and it is
// kept; it is not what makes the common case correct.
//
// `enabled` defaults to on (omitted `options` behaves exactly as before) —
// pass `{ enabled: false }` while the caller doesn't have a branch id yet
// (e.g. the ticket detail page, still loading the ticket its reassign picker
// is scoped to) so the query doesn't fire with `branchId: undefined` and
// fetch the whole company's roster for a render nothing uses it in.
export const useEmployees = (
  branchId?: string,
  options?: { enabled?: boolean }
) => {
  return useQuery({
    queryKey: ['employees', branchId],
    queryFn: () => getEmployees(branchId),
    enabled: options?.enabled
  });
};
