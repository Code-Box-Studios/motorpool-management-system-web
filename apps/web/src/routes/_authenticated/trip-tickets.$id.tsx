import { USER_ROLES } from '@/lib/enums';
import TripTicketsInner from '@/components/pages/trip-tickets/trip-tickets-inner';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/trip-tickets/$id')({
  staticData: { allowedRoles: Object.values(USER_ROLES) },
  component: TripTicketsInner
});
