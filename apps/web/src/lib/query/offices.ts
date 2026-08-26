import { useQuery } from '@tanstack/react-query';
import { getDepartmentOffices, getOfficeHeads } from '@/lib/api/offices';

// Active offices only — the list every PICKER reads.
export const useDepartmentOffices = () => {
  return useQuery({
    queryKey: ['departmentOffices'],
    queryFn: () => getDepartmentOffices()
  });
};

// DISPLAY ONLY — archived offices included. The twin of useBranchesForDisplay,
// and for the same reason: a trip ticket resolves its office name client-side
// from this list, so reading the active-only one blanks the Office field on
// every ticket filed under an office that has since been archived.
//
// NEVER populate a form control from this hook. Use useDepartmentOffices().
export const useDepartmentOfficesForDisplay = () => {
  return useQuery({
    queryKey: ['departmentOffices', 'all'],
    queryFn: () => getDepartmentOffices(true)
  });
};

export const useOfficeHeads = () => {
  return useQuery({
    queryKey: ['officeHeads'],
    queryFn: getOfficeHeads
  });
};
