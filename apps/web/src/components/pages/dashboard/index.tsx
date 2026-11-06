import FleetTracking from './fleet-tracking';
import GuardConfirmationPage from '@/components/pages/trip-tickets/guard-confirmation';
import DriverDashboard from '@/components/pages/trip-tickets/driver-dashboard';
import RequesterDashboard from '@/components/pages/trip-tickets/requester-dashboard';
import EvpApprovalPage from '@/components/pages/job-order/evp-approval';
import { useUserRole } from '@/hooks/use-user-role';
import { USER_ROLES } from '@/lib/enums';
import NeedsYou from './needs-you';
import PreventiveMaintenance from './preventive-maintenance';
import PredictiveMaintenance from './predictive-maintenance';
import { MetricStrip } from '@/components/shared/metric-card';
import {
  useVehicleStatusCounts,
  useCompletedTripsCount
} from '@/lib/query/analytics';

const Dashboard = () => {
  const { data: userRole } = useUserRole();
  // Read before the queries, not after: hooks cannot be conditional, so the
  // role has to be in hand up here to keep the fleet-wide reads below from
  // firing for the roles that never reach the fleet view.
  const userRoleName = userRole?.roles?.name;
  // Fleet analytics and tracking are restricted to administrators and EVP Operations.
  const canTrackFleet =
    userRoleName === USER_ROLES.admin ||
    userRoleName === USER_ROLES.evp_operations;

  const { data: statusCounts } = useVehicleStatusCounts(canTrackFleet);
  const { data: completedTrips } = useCompletedTripsCount(canTrackFleet);

  // Check user role and show appropriate view

  // If user is security guard, show the guard confirmation page
  if (userRoleName === USER_ROLES.security_guard) {
    return <GuardConfirmationPage />;
  }

  // If user is EVP Operations, show the approval page
  if (userRoleName === USER_ROLES.evp_operations) {
    return <EvpApprovalPage />;
  }

  // If user is driver, show only assigned trip tickets dashboard
  if (userRoleName === USER_ROLES.driver) {
    return <DriverDashboard />;
  }

  // A requester asks for vans, they do not run the pool. Without this branch
  // they fell through to the admin console below — fleet metrics, the approval
  // queue, the maintenance panels and the tracking map, none of which is theirs.
  // The API already refuses them the data (analytics and /gps/latest are
  // admin/EVP only), so what they actually got was an admin-shaped page full of
  // zeroes, wedged on the GPS request below that 403s for their role.
  if (userRoleName === USER_ROLES.requester) {
    return <RequesterDashboard />;
  }

  const metrics = [
    { label: 'Available Vehicles', value: statusCounts?.available ?? 0 },
    { label: 'Under Maintenance', value: statusCounts?.underMaintenance ?? 0 },
    { label: 'On Trip', value: statusCounts?.onTrip ?? 0 },
    { label: 'Trips Completed', value: completedTrips ?? 0 }
  ];

  return (
    <div className="space-y-6">
      {/* What needs a human right now — before any numbers. */}
      <NeedsYou />

      <MetricStrip metrics={metrics} />

      {/* Both panels are previews here, not the record: showViewAll keeps each
          to its top few rows and sends the rest to the Maintenance tabs.
          items-start so the shorter panel does not stretch to match the taller.
          Side by side only when there is genuinely room — below xl these two
          squeeze their cards until the vehicle names wrap mid-word. */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <PreventiveMaintenance showViewAll />
        <PredictiveMaintenance showViewAll />
      </div>

      {canTrackFleet && <FleetTracking />}
    </div>
  );
};

export default Dashboard;
