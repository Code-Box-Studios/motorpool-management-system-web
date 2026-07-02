import JobOrdersPage from '@/components/pages/job-order';
import { USER_ROLES } from '@/lib/enums';
import { createFileRoute } from '@tanstack/react-router';
import { ClipboardList } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/job-order/')({
  component: JobOrdersPage,
  staticData: {
    title: 'Job Orders',
    icon: ClipboardList,
    group: 'Management',
    allowedRoles: [
      USER_ROLES.admin,
      // USER_ROLES.evp_operations,
      // USER_ROLES.security_guard,
      // USER_ROLES.requester,
      USER_ROLES.driver
    ]
  }
});
