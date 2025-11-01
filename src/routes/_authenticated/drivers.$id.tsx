import { DriverDetails } from '@/components/pages/drivers/driver-details';
import { createFileRoute, useParams } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/drivers/$id')({
  component: RouteComponent
});

function RouteComponent() {
  const { id } = useParams({ from: '/_authenticated/drivers/$id' });

  return <DriverDetails id={id} />;
}
