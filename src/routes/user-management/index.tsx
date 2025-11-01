import AuthenticatedLayout from '@/components/layout/authenticated-layout';
import UserManagement from '@/components/pages/user-management';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/user-management/')({
  component: RouteComponent
});

function RouteComponent() {
  return (
    <AuthenticatedLayout>
      <UserManagement />
    </AuthenticatedLayout>
  );
}
