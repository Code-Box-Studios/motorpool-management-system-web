import { USER_ROLES } from '@/lib/enums';
import JobOrderInner from '@/components/pages/job-order/job-order-inner';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/job-order/$id')({
  staticData: {
    allowedRoles: [
      USER_ROLES.admin,
      USER_ROLES.requester,
      USER_ROLES.driver,
      USER_ROLES.evp_operations
    ]
  },
  component: JobOrderInner
});
