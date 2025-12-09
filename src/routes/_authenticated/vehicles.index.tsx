import Vehicles from '@/components/pages/vehicles';
import { USER_ROLES } from '@/lib/enums';
import { createFileRoute } from '@tanstack/react-router';
import { CarIcon } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/vehicles/')({
  component: Vehicles,
  staticData: {
    title: 'Vehicles',
    icon: CarIcon,
    group: 'Assets',
    allowedRoles: [
      USER_ROLES.admin
      // USER_ROLES.evp_operations,
      // USER_ROLES.security_guard,
      // USER_ROLES.requester,
      // USER_ROLES.driver
    ]
  }
});
