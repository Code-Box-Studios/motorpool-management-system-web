import MaintenancePage from '@/components/pages/maintenance';
import { USER_ROLES } from '@/lib/enums';
import { createFileRoute } from '@tanstack/react-router';
import { LucideCog } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/maintenance/')({
  component: MaintenancePage,
  staticData: {
    title: 'Maintenance',
    icon: LucideCog,
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
