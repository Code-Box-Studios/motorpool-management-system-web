import Drivers from '@/components/pages/drivers';
import { USER_ROLES } from '@/lib/enums';
import { createFileRoute } from '@tanstack/react-router';
import { Users2 } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/drivers/')({
  component: Drivers,
  staticData: {
    title: 'Drivers',
    icon: Users2,
    group: 'Management',
    allowedRoles: [
      USER_ROLES.admin
      // USER_ROLES.evp_operations,
      // USER_ROLES.security_guard,
      // USER_ROLES.requester,
      // USER_ROLES.driver
    ]
  }
});
