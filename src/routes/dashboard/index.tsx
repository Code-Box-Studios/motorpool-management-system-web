import AuthenticatedLayout from '@/components/layout/authenticated-layout';
import Dashboard from '@/components/pages/dashboard';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/dashboard/')({
  component: RouteComponent
});

function RouteComponent() {
  return (
    <AuthenticatedLayout>
      <Dashboard />
    </AuthenticatedLayout>
  );
}
