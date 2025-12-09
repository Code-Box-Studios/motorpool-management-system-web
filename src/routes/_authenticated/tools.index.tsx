import { createFileRoute } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import Tools from '../../components/pages/tools';
import { USER_ROLES } from '@/lib/enums';

export const Route = createFileRoute('/_authenticated/tools/')({
  component: Tools,
  staticData: {
    title: 'Tools',
    icon: Settings,
    group: 'Assets',
    allowedRoles: [
      USER_ROLES.admin,
      // USER_ROLES.evp_operations,
      // USER_ROLES.security_guard,
      // USER_ROLES.requester,
      USER_ROLES.driver
    ]
  }
});
