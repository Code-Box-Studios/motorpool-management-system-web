import { Link } from '@tanstack/react-router';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Radio } from 'lucide-react';
import StatusBadge from '@/components/shared/status-badge';
import { DeviceOnlineIndicator } from '@/components/shared/device-online-indicator';
import { Skeleton } from '@/components/ui/skeleton';
import { useVehicleTrackerDevice } from '@/lib/query/tracker-devices';
import { useUserRole } from '@/hooks/use-user-role';
import { USER_ROLES } from '@/lib/enums';
import { TRACKER_DEVICE_STATUS } from '@mms/shared';

interface VehicleTrackerSummaryProps {
  vehicleId: string;
}

// Read-only surfacing of the vehicle's assigned tracker. Management (assign/
// replace/decommission) lives on the admin Trackers page — this only reads.
// The tracker-devices API is admin-only, so this renders nothing for non-admins
// (and skips the fetch to avoid a needless 403).
export const VehicleTrackerSummary = ({
  vehicleId
}: VehicleTrackerSummaryProps) => {
  const { data: userRole } = useUserRole();
  const isAdmin = userRole?.roles?.name === USER_ROLES.admin;
  const { data, isLoading } = useVehicleTrackerDevice(vehicleId, isAdmin);

  if (!isAdmin) return null;

  if (isLoading) {
    return (
      <div className="mt-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-lg md:w-1/2" />
      </div>
    );
  }

  const device =
    data?.data?.find((d) => d.status === TRACKER_DEVICE_STATUS.ACTIVE) ??
    data?.data?.[0];

  return (
    <div className="mt-8 space-y-4">
      <h2 className="text-xl font-semibold">GPS Tracker</h2>
      <Card className="md:w-1/2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="h-5 w-5" />
            Assigned Tracker
          </CardTitle>
          <CardDescription>
            The GPS device currently registered to this vehicle.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {device ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">IMEI</span>
                <Link
                  to="/tracker-devices/$deviceId"
                  params={{ deviceId: device.id }}
                  className="font-medium hover:underline"
                >
                  {device.imei}
                </Link>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">Status</span>
                <StatusBadge status={device.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  Connectivity
                </span>
                <DeviceOnlineIndicator lastSeenAt={device.lastSeenAt} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  Last Seen
                </span>
                <span className="text-sm">
                  {device.lastSeenAt
                    ? new Date(device.lastSeenAt).toLocaleString()
                    : 'Never'}
                </span>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              No tracker assigned.{' '}
              <Link to="/tracker-devices" className="underline">
                Manage trackers
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
