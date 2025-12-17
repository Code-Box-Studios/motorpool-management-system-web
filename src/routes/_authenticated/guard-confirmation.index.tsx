import { createFileRoute } from '@tanstack/react-router';
import GuardConfirmationPage from '@/components/pages/trip-tickets/guard-confirmation';
import { ShieldCheck } from 'lucide-react';
import { USER_ROLES } from '@/lib/enums';

export const Route = createFileRoute('/_authenticated/guard-confirmation/')({
  component: GuardConfirmationPage,
  staticData: {
    title: 'Guard Confirmation',
    icon: ShieldCheck,
    group: 'Operations',
    allowedRoles: [USER_ROLES.security_guard, USER_ROLES.admin]
  }
});
