import TripTicketsPage from '@/components/pages/trip-tickets';
import { createFileRoute } from '@tanstack/react-router';
import { Ticket } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/trip-tickets/')({
  component: TripTicketsPage,
  staticData: {
    title: 'Trip Tickets',
    icon: Ticket,
    group: 'Management'
  }
});
