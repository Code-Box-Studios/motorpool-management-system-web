import { createFileRoute } from '@tanstack/react-router';
import { ChartNoAxesCombined } from 'lucide-react';
import { USER_ROLES } from '@/lib/enums';
import ReportsPage from '@/components/pages/reports';
export const Route = createFileRoute('/_authenticated/reports')({
  component: ReportsPage,
  staticData: {
    title: 'Reports',
    icon: ChartNoAxesCombined,
    group: 'Management',
    allowedRoles: [USER_ROLES.admin]
  }
});
