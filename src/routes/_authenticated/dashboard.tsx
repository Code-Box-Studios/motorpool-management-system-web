import Dashboard from '@/components/pages/dashboard';
import { USER_ROLES } from '@/lib/enums';
import { createFileRoute } from '@tanstack/react-router';
import { LayoutDashboard } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: RouteComponent,
  staticData: {
    title: 'Dashboard',
    icon: LayoutDashboard,
    group: 'Management',
    allowedRoles: [
      USER_ROLES.admin,
      USER_ROLES.evp_operations,
      USER_ROLES.requester,
      USER_ROLES.driver
    ]
  }
});

function RouteComponent() {
  return <Dashboard />;
}
