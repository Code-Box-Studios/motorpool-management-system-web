import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export const useDepartmentOffices = () => {
  return useQuery({
    queryKey: ['departmentOffices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('department_offices')
        .select('*')
        .order('name');

      if (error) throw error;
      return data;
    }
  });
};

export const useOfficeHeads = () => {
  return useQuery({
    queryKey: ['officeHeads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('office_heads')
        .select('*')
        .order('name');

      if (error) throw error;
      return data;
    }
  });
};
