import { useQuery } from '@tanstack/react-query';
import { getTripTickets, getTripTicketById,  } from '@/lib/supabase/trip-tickets';

export const useTripTickets = (page: number = 1, limit: number = 10) => {
  return useQuery({
    queryKey: ['trip_tickets', page],
    queryFn: () => getTripTickets(page, limit)
  });
};

export const useTripTicket = (id: string) => {
  return useQuery({
    queryKey: ['trip_ticket', id],
    queryFn: () => getTripTicketById(id),
    enabled: !!id
  });
};
