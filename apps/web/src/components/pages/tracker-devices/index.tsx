import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import StatusBadge from '@/components/shared/status-badge';
import { DeviceOnlineIndicator } from '@/components/shared/device-online-indicator';
import { TableSkeleton } from '@/components/shared/skeleton/table-skeleton';
import { useTrackerDevices } from '@/lib/query/tracker-devices';

const COLUMNS = [
  { label: 'IMEI', width: 'w-40' },
  { label: 'Label', width: 'w-32' },
  { label: 'SIM Number', width: 'w-32' },
  { label: 'Status', width: 'w-24' },
  { label: 'Connectivity', width: 'w-24' },
  { label: 'Last Seen', width: 'w-32' }
];

const TrackerDevices = () => {
  const { data, isLoading, error } = useTrackerDevices();
  const devices = data?.data;

  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle>Tracker Devices</CardTitle>
          <CardDescription>
            Register, assign, and decommission GPS tracker devices.
          </CardDescription>
          <CardAction>
            <Link
              to="/tracker-devices/add-device"
              className={cn(buttonVariants())}
            >
              Register Device
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
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
                          className="font-medium hover:underline"
                        >
                          {device.imei}
                        </Link>
                      </TableCell>
                      <TableCell>{device.label || '—'}</TableCell>
                      <TableCell>{device.simNumber || '—'}</TableCell>
                      <TableCell>
                        <StatusBadge status={device.status} />
                      </TableCell>
                      <TableCell>
                        <DeviceOnlineIndicator lastSeenAt={device.lastSeenAt} />
                      </TableCell>
                      <TableCell>
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
