import Drivers from '@/components/pages/drivers';
import AuthenticatedLayout from '@/components/layout/authenticated-layout';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/drivers/')({
  component: RouteComponent
});

function RouteComponent() {
  return (
    <AuthenticatedLayout>
      <Drivers />
    </AuthenticatedLayout>
  );
}
