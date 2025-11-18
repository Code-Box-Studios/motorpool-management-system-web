import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTripTicket, updateTripTicket } from '@/lib/supabase/trip-tickets';
import type { NewTripTicket, UpdateTripTicket } from '../types';

export const useCreateTripTicket = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tripTicket: NewTripTicket) => createTripTicket(tripTicket),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip_tickets'] });
    }
  });
};

export const useUpdateTripTicket = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates
    }: {
      id: string;
      updates: UpdateTripTicket;
    }) => updateTripTicket(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip_tickets'] });
    }
  });
};
