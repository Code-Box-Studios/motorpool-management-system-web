import AuthenticatedLayout from '@/components/layout/authenticated-layout';
import Assets from '@/components/pages/assets';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/assets/')({
  component: RouteComponent
});

function RouteComponent() {
  return (
    <AuthenticatedLayout>
      <Assets />
    </AuthenticatedLayout>
  );
}
