import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createTripTicket,
  updateTripTicket,
  deleteTripTicket,
  approveTripTicket,
  approveEvpTripTicket,
  disapproveTripTicket,
  cancelTripTicket,
  checkOutTripTicket,
  checkInTripTicket
} from '@/lib/api/trip-tickets';
import type { ApiError } from '@/lib/api/client';
import type { NewTripTicket } from '../types';
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
      updates: Record<string, unknown>;
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

// Invalidates both the list and the single-ticket cache for `id` — shared by
// every transition hook below.
const invalidateTripTicket = (
  queryClient: ReturnType<typeof useQueryClient>,
  id: string
) => {
  queryClient.invalidateQueries({ queryKey: ['trip_tickets'] });
  queryClient.invalidateQueries({ queryKey: ['trip_ticket', id] });
  // check-out/check-in flip the vehicle's status (available <-> on_trip) and a
  // completed trip changes the dashboard counts, so refresh those views too.
  queryClient.invalidateQueries({ queryKey: ['vehicles'] });
  queryClient.invalidateQueries({ queryKey: ['analytics'] });
};

// admin: submits the fuel-allocation details, moving the ticket to
// pending_fuel_allocation_approval.
export const useApproveTripTicket = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      liters,
      fuelType,
      date,
      purpose,
      tripTo
    }: {
      id: string;
      liters: number;
      fuelType: string;
      date: string;
      purpose: string;
      tripTo: string;
    }) => approveTripTicket(id, { liters, fuelType, date, purpose, tripTo }),
    onSuccess: (_data, variables) => {
      invalidateTripTicket(queryClient, variables.id);
      toast.success('Trip ticket approved successfully!');
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to approve trip ticket: ${error.message}`);
    }
  });
};

// evp_operations: approves the fuel allocation, moving the ticket to approved.
export const useApproveEvpTripTicket = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => approveEvpTripTicket(id),
    onSuccess: (_data, variables) => {
      invalidateTripTicket(queryClient, variables.id);
      toast.success('Trip ticket approved successfully!');
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to approve trip ticket: ${error.message}`);
    }
  });
};

// admin or evp_operations: disapproves the ticket with a required reason.
export const useDisapproveTripTicket = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      disapproveTripTicket(id, reason),
    onSuccess: (_data, variables) => {
      invalidateTripTicket(queryClient, variables.id);
      toast.success('Trip ticket disapproved successfully!');
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to disapprove trip ticket: ${error.message}`);
    }
  });
};

// admin or the requester who owns the ticket: cancels with a required reason.
export const useCancelTripTicket = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      cancelTripTicket(id, reason),
    onSuccess: (_data, variables) => {
      invalidateTripTicket(queryClient, variables.id);
      toast.success('Trip ticket cancelled successfully!');
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to cancel trip ticket: ${error.message}`);
    }
  });
};

// security_guard: records the pre-trip guard/timestamp and starts the trip.
export const useCheckOutTripTicket = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => checkOutTripTicket(id),
    onSuccess: (_data, variables) => {
      invalidateTripTicket(queryClient, variables.id);
      toast.success('Trip ticket checked out successfully!');
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to check out trip ticket: ${error.message}`);
    }
  });
};

// security_guard: records the post-trip guard/timestamp and completes the trip.
export const useCheckInTripTicket = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => checkInTripTicket(id),
    onSuccess: (_data, variables) => {
      invalidateTripTicket(queryClient, variables.id);
      toast.success('Trip ticket checked in successfully!');
    },
    onError: (error: ApiError) => {
      toast.error(`Failed to check in trip ticket: ${error.message}`);
    }
  });
};
