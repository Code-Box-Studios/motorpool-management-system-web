import { useQuery } from '@tanstack/react-query';
import { getDepartmentOffices, getOfficeHeads } from '@/lib/api/offices';

export const useDepartmentOffices = () => {
  return useQuery({
    queryKey: ['departmentOffices'],
    queryFn: getDepartmentOffices
  });
};

export const useOfficeHeads = () => {
  return useQuery({
    queryKey: ['officeHeads'],
    queryFn: getOfficeHeads
  });
};
