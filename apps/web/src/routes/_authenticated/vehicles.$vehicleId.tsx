import VehicleInner from '@/components/pages/vehicles/vehicle-inner/page';
import { createFileRoute, useParams } from '@tanstack/react-router';
import { USER_ROLES } from '@/lib/enums';

export const Route = createFileRoute('/_authenticated/vehicles/$vehicleId')({
  staticData: {
    allowedRoles: [
      USER_ROLES.admin,
      USER_ROLES.requester,
      USER_ROLES.driver,
      USER_ROLES.evp_operations
    ]
  },
  component: RouteComponent
});

function RouteComponent() {
  const { vehicleId } = useParams({
    from: '/_authenticated/vehicles/$vehicleId'
  });

  return <VehicleInner vehicleId={vehicleId} />;
}
