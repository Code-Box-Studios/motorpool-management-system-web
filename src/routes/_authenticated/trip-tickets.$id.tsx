import TripTicketsInner from '@/components/pages/trip-tickets/trip-tickets-inner';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/trip-tickets/$id')({
  component: TripTicketsInner
});
