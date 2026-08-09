import { useQuery } from '@tanstack/react-query';
import {
  getTripTickets,
  getTripTicketById,
  getAllTripTickets
} from '@/lib/api/trip-tickets';

export const useTripTickets = (
  page: number = 1,
  limit: number = 10,
  userId?: string,
  branchId?: string,
  driverId?: string
) => {
  return useQuery({
    queryKey: ['trip_tickets', page, limit, userId, branchId, driverId],
    queryFn: () => getTripTickets(page, limit, userId, branchId, driverId)
  });
};

export const useAllTripTickets = (userId?: string, branchId?: string) => {
  return useQuery({
    queryKey: ['trip_tickets', 'all', userId, branchId],
    queryFn: () => getAllTripTickets(userId, branchId)
  });
};

export const useTripTicket = (id: string) => {
  return useQuery({
    queryKey: ['trip_ticket', id],
    queryFn: () => getTripTicketById(id),
    enabled: !!id
  });
};
