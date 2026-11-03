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
  search?: string,
  filters?: Record<string, string>
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
      search,
      filters
    ],
    queryFn: () =>
      getTripTickets(
        page,
        limit,
        userId,
        branchId,
        driverId,
        sort,
        search,
        filters
      )
  });
};

export const useAllTripTickets = (
  userId?: string,
  branchId?: string,
  driverId?: string,
  search?: string,
  filters?: Record<string, string>
) => {
  return useQuery({
    queryKey: [
      'trip_tickets',
      'all',
      userId,
      branchId,
      driverId,
      search,
      filters
    ],
    queryFn: () =>
      getAllTripTickets(userId, branchId, driverId, search, filters)
  });
};

export const useTripTicket = (id: string) => {
  return useQuery({
    queryKey: ['trip_ticket', id],
    queryFn: () => getTripTicketById(id),
    enabled: !!id
  });
};

// Complete employee roster across branches. Organization edits invalidate the
// employees prefix, including this picker and the employee list.
export const useGuideOptions = () =>
  useQuery({
    queryKey: ['employees', 'guide-options'],
    queryFn: getTripGuideOptions
  });
