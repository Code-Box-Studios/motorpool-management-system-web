import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationsRead
} from '@/lib/api/notifications';

export const NOTIFICATIONS_KEY = ['notifications'];

// Polled rather than pushed: the app already polls (the tracking map runs at
// 5s), and a bell is not worth a socket. 30s is slow enough to be invisible in
// the network tab and fast enough that nobody refreshes to check.
export const useNotifications = () => {
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => getNotifications(20),
    refetchInterval: 30_000
  });
};

export const useMarkNotificationsRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    }
  });
};

export const useMarkAllNotificationsRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    }
  });
};
