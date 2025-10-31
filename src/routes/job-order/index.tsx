import AuthenticatedLayout from '@/components/layout/authenticated-layout';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/job-order/')({
  component: RouteComponent
});

function RouteComponent() {
  return <AuthenticatedLayout>Hello "/job-order/"!</AuthenticatedLayout>;
}
