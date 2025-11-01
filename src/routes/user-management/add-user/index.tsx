import AuthenticatedLayout from '@/components/layout/authenticated-layout';
import { AddUser } from '@/components/pages/user-management/add-user';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/user-management/add-user/')({
  component: RouteComponent
});

function RouteComponent() {
  return (
    <AuthenticatedLayout>
      <AddUser />
    </AuthenticatedLayout>
  );
}
