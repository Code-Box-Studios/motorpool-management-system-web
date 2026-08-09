// src/lib/query/user-management.ts
import { useQuery } from '@tanstack/react-query';
import { getAllAdmins, getAllUsers, getUsers } from '../api/user-management';

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

// One page of users for the user-management table. Keeps the 'allUsers' key
// prefix so the existing mutations' invalidations cover paged queries too.
export const useUsers = (page: number = 1, limit: number = 10) => {
  return useQuery({
    queryKey: ['allUsers', page, limit],
    queryFn: () => getUsers(page, limit)
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
