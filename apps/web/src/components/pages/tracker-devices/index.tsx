import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import PageHeader from '@/components/shared/page-header';
import StatusBadge from '@/components/shared/status-badge';
import { DeviceOnlineIndicator } from '@/components/shared/device-online-indicator';
import { TableSkeleton } from '@/components/shared/skeleton/table-skeleton';
import { useTrackerDevices } from '@/lib/query/tracker-devices';
import { useAllVehicles } from '@/lib/query/vehicles';
import { assignedVehicleLabel } from '@/lib/utils/tracker-devices';

const COLUMNS = [
  { label: 'IMEI', width: 'w-40' },
  { label: 'Label', width: 'w-32' },
  { label: 'Vehicle', width: 'w-40' },
  { label: 'SIM Number', width: 'w-32' },
  { label: 'Status', width: 'w-24' },
  { label: 'Connectivity', width: 'w-24' },
  { label: 'Last Seen', width: 'w-32' }
];

const TrackerDevices = () => {
  const { data, isLoading, error } = useTrackerDevices();
  // A device's vehicleId is a key; the row has to name the vehicle instead.
  const { data: vehicles, isLoading: vehiclesLoading } = useAllVehicles();
  const devices = data?.data;
  const vehiclesById = new Map((vehicles ?? []).map((v) => [v.id, v]));

  return (
    <div>
      <PageHeader
        title="Tracker Devices"
        description="Register, assign, and decommission GPS tracker devices."
        action={
          <Link
            to="/tracker-devices/add-device"
            className={cn(buttonVariants())}
          >
            Register Device
          </Link>
        }
      />

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <TableSkeleton rows={5} columns={COLUMNS} />
          ) : error ? (
            <div className="text-destructive p-8 text-center">
              Error loading devices: {error.message}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {COLUMNS.map((c) => (
                    <TableHead key={c.label}>{c.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices && devices.length > 0 ? (
                  devices.map((device) => (
                    <TableRow key={device.id}>
                      <TableCell>
                        <Link
                          to="/tracker-devices/$deviceId"
                          params={{ deviceId: device.id }}
                          className="font-mono text-sm font-medium hover:underline"
                        >
                          {device.imei}
                        </Link>
                      </TableCell>
                      <TableCell>{device.label || '—'}</TableCell>
                      <TableCell
                        className={cn(
                          'text-sm',
                          !device.vehicleId && 'text-muted-foreground'
                        )}
                      >
                        {assignedVehicleLabel(
                          device.vehicleId,
                          vehiclesById.get(device.vehicleId ?? ''),
                          vehiclesLoading
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {device.simNumber || '—'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={device.status} />
                      </TableCell>
                      <TableCell>
                        <DeviceOnlineIndicator lastSeenAt={device.lastSeenAt} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {device.lastSeenAt
                          ? new Date(device.lastSeenAt).toLocaleString()
                          : 'Never'}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={COLUMNS.length}
                      className="text-muted-foreground py-8 text-center"
                    >
                      No tracker devices found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TrackerDevices;
