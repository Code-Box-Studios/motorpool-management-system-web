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
    allowedRoles: [
      USER_ROLES.admin,
      // USER_ROLES.evp_operations,
      // USER_ROLES.security_guard,
      USER_ROLES.requester,
      // USER_ROLES.driver
    ]
  }
});
