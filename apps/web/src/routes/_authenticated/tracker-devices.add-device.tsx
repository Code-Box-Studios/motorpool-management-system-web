import { AddTrackerDevice } from '@/components/pages/tracker-devices/add-device';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_authenticated/tracker-devices/add-device'
)({
  component: AddTrackerDevice
});
