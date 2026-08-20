import TripTicketsPage from '@/components/pages/trip-tickets';
import { USER_ROLES } from '@/lib/enums';
import { createFileRoute } from '@tanstack/react-router';
import { Ticket } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/trip-tickets/')({
  component: TripTicketsPage,
  staticData: {
    title: 'Trip Tickets',
    icon: Ticket,
    group: 'Management',
    // Admin only. This is the fleet-wide list — the requester who used to reach
    // it saw a page built for approving other people's trips, with their own
    // rows filtered in. Their dashboard lists those same requests in the terms
    // they care about, so this route is no longer theirs; the individual ticket
    // (trip-tickets.$id, ungated and scoped by the API) still is.
    allowedRoles: [
      USER_ROLES.admin
      // USER_ROLES.evp_operations,
      // USER_ROLES.security_guard,
      // USER_ROLES.requester,
      // USER_ROLES.driver
    ]
  }
});
