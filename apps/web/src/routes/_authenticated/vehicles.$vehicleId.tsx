import VehicleInner from '@/components/pages/vehicles/vehicle-inner/page';
import { createFileRoute, useParams } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/vehicles/$vehicleId')({
  component: RouteComponent
});

function RouteComponent() {
  const { vehicleId } = useParams({
    from: '/_authenticated/vehicles/$vehicleId'
  });

  return <VehicleInner vehicleId={vehicleId} />;
}
