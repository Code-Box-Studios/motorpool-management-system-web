import { useQuery } from '@tanstack/react-query';
import {
  getTripTickets,
  getTripTicketById,
  getAllTripTickets,
  getTripGuideOptions
} from '@/lib/api/trip-tickets';

export const useTripTickets = (
  page: number = 1,
  limit: number = 10,
  userId?: string,
  branchId?: string,
  driverId?: string,
  sort?: { sortBy: string; sortOrder: 'asc' | 'desc' },
  search?: string
) => {
  return useQuery({
    queryKey: [
      'trip_tickets',
      page,
      limit,
      userId,
      branchId,
      driverId,
      sort?.sortBy,
      sort?.sortOrder,
      search
    ],
    queryFn: () =>
      getTripTickets(page, limit, userId, branchId, driverId, sort, search)
  });
};

export const useAllTripTickets = (
  userId?: string,
  branchId?: string,
  driverId?: string,
  search?: string
) => {
  return useQuery({
    queryKey: ['trip_tickets', 'all', userId, branchId, driverId, search],
    queryFn: () => getAllTripTickets(userId, branchId, driverId, search)
  });
};

export const useTripTicket = (id: string) => {
  return useQuery({
    queryKey: ['trip_ticket', id],
    queryFn: () => getTripTicketById(id),
    enabled: !!id
  });
};

// Complete public roster across branches; the API applies role and status rules.
export const useGuideOptions = () =>
  useQuery({
    queryKey: ['trip_guide_options'],
    queryFn: getTripGuideOptions
  });
