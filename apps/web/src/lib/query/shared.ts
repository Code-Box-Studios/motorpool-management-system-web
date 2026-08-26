import { useQuery } from '@tanstack/react-query';
import { getAllBranches } from '../api/shared';

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
