import { AddTrackerDevice } from '@/components/pages/tracker-devices/add-device';
import { AdminOnly } from '@/components/shared/admin-only';
import { createFileRoute } from '@tanstack/react-router';

// No `staticData` here on purpose: it would both mis-render as a sidebar entry
// and still not gate the route. The AdminOnly wrapper does the gating.
export const Route = createFileRoute(
  '/_authenticated/tracker-devices/add-device'
)({
  component: RouteComponent
});

function RouteComponent() {
  return (
    <AdminOnly>
      <AddTrackerDevice />
    </AdminOnly>
  );
}
