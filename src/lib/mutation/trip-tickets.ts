import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTripTicket, updateTripTicket, deleteTripTicket } from '@/lib/supabase/trip-tickets';
import type { NewTripTicket, UpdateTripTicket } from '../types';
import { toast } from 'sonner';

export const useCreateTripTicket = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tripTicket: NewTripTicket) => createTripTicket(tripTicket),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip_tickets'] });
      toast.success('Trip ticket created successfully!');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create trip ticket: ${error.message}`);
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
      toast.success('Trip ticket updated successfully!');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update trip ticket: ${error.message}`);
    }
  });
};

export const useDeleteTripTicket = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTripTicket(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip_tickets'] });
      toast.success('Trip ticket deleted successfully!');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete trip ticket: ${error.message}`);
    }
  });
};
