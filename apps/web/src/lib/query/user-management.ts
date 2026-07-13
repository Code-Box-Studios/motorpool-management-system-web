// src/lib/query/user-management.ts
import { useQuery } from '@tanstack/react-query';
import { getAllAdmins, getAllUsers } from '../api/user-management';

export const useAdmins = () => {
  return useQuery({
    queryKey: ['admins'],
    queryFn: getAllAdmins
  });
};

export const useAllUsers = () => {
  return useQuery({
    queryKey: ['allUsers'],
    queryFn: getAllUsers
  });
};
