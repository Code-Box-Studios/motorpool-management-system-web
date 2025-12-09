import UserManagement from '@/components/pages/user-management';
import { USER_ROLES } from '@/lib/enums';
import { createFileRoute } from '@tanstack/react-router';
import { UserRoundCogIcon } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/user-management/')({
  component: UserManagement,
  staticData: {
    title: 'User Management',
    icon: UserRoundCogIcon,
    group: 'Settings',
    allowedRoles: [
      USER_ROLES.admin
      // USER_ROLES.evp_operations,
      // USER_ROLES.security_guard,
      // USER_ROLES.requester,
      // USER_ROLES.driver
    ]
  }
});
