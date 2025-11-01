import { AddDriver } from '@/components/pages/drivers/add-driver';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/drivers/add-driver')({
  component: RouteComponent
});

function RouteComponent() {
  return <AddDriver />;
}
