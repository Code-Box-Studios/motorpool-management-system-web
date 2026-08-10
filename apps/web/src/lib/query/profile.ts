// src/lib/query/profile.ts
import { useQuery } from '@tanstack/react-query';
import { getOwnProfile } from '../api/profile';

// The signed-in user's own profile. Its own cache key, deliberately NOT part of
// 'allUsers': that list is an admin-only read, and a driver or guard needs this
// row too. Anything that shows the current user (the page, the header) can read
// this same key, so one edit repaints all of them.
export const useOwnProfile = () => {
  return useQuery({
    queryKey: ['profile', 'me'],
    queryFn: getOwnProfile
  });
};
