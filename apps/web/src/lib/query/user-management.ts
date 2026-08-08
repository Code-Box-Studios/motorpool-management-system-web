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

// A single user, selected from the shared 'allUsers' cache (there is no
// GET /users/:id endpoint). `data` is undefined while loading or if not found.
export const useUser = (userId: string) => {
  return useQuery({
    queryKey: ['allUsers'],
    queryFn: getAllUsers,
    select: (users) => users.find((u) => u.id === userId)
  });
};
