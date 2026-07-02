import AddTripTicket from '@/components/pages/trip-tickets/add-trip-ticket/page';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_authenticated/trip-tickets/add-trip-ticket'
)({
  component: AddTripTicket
});
