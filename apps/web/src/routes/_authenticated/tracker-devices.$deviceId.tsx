import TrackerDeviceInner from '@/components/pages/tracker-devices/device-details';
import { AdminOnly } from '@/components/shared/admin-only';
import { createFileRoute, useParams } from '@tanstack/react-router';

// See tracker-devices.add-device.tsx — the pathname-keyed `_authenticated` guard
// cannot match a dynamic route at all, so the gate has to live in the component.
export const Route = createFileRoute(
  '/_authenticated/tracker-devices/$deviceId'
)({
  component: RouteComponent
});

function RouteComponent() {
  const { deviceId } = useParams({
    from: '/_authenticated/tracker-devices/$deviceId'
  });
  return (
    <AdminOnly>
      <TrackerDeviceInner deviceId={deviceId} />
    </AdminOnly>
  );
}
