import Dashboard from '@/components/pages/dashboard';
import { createFileRoute } from '@tanstack/react-router';
import { LayoutDashboard } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: RouteComponent,
  staticData: {
    title: 'Dashboard',
    icon: LayoutDashboard,
    group: 'Management'
  }
});

function RouteComponent() {
  return <Dashboard />;
}
