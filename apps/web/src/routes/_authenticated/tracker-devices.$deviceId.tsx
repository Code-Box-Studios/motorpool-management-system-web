import TrackerDeviceInner from '@/components/pages/tracker-devices/device-details';
import { createFileRoute, useParams } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/tracker-devices/$deviceId')({
  component: RouteComponent
});

function RouteComponent() {
  const { deviceId } = useParams({
    from: '/_authenticated/tracker-devices/$deviceId'
  });
  return <TrackerDeviceInner deviceId={deviceId} />;
}
