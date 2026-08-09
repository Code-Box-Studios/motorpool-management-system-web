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
import TablePagination from '@/components/shared/table-pagination';
import SortableTableHead from '@/components/shared/sortable-table-head';
import { useListControls } from '@/hooks/use-list-controls';
import { useTrackerDevices } from '@/lib/query/tracker-devices';
import { useAllVehicles } from '@/lib/query/vehicles';
import { assignedVehicleLabel } from '@/lib/utils/tracker-devices';

// sortKey values come from the API's TRACKER_DEVICE_SORT_COLUMNS allowlist.
// Vehicle is resolved client-side from a lookup, and Connectivity is derived
// from lastSeenAt on the client — neither maps to a sortable DB column.
const COLUMNS: { label: string; width: string; sortKey?: string }[] = [
  { label: 'IMEI', width: 'w-40', sortKey: 'imei' },
  { label: 'Label', width: 'w-32', sortKey: 'label' },
  { label: 'Vehicle', width: 'w-40' },
  { label: 'SIM Number', width: 'w-32', sortKey: 'simNumber' },
  { label: 'Status', width: 'w-24', sortKey: 'status' },
  { label: 'Connectivity', width: 'w-24' },
  { label: 'Last Seen', width: 'w-32', sortKey: 'lastSeenAt' }
];

const TrackerDevices = () => {
  const { page, sort, setPage, handleSort } = useListControls();
  const limit = 10;
  const { data, isLoading, error } = useTrackerDevices(
    { page, limit },
    sort ?? undefined
  );
  // A device's vehicleId is a key; the row has to name the vehicle instead.
  const { data: vehicles, isLoading: vehiclesLoading } = useAllVehicles();
  const devices = data?.data;
  const totalPages = Math.ceil((data?.count ?? 0) / limit);
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
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    {COLUMNS.map((c) =>
                      c.sortKey ? (
                        <SortableTableHead
                          key={c.label}
                          label={c.label}
                          sortKey={c.sortKey}
                          sort={sort}
                          onSort={handleSort}
                        />
                      ) : (
                        <TableHead key={c.label}>{c.label}</TableHead>
                      )
                    )}
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
                          <DeviceOnlineIndicator
                            lastSeenAt={device.lastSeenAt}
                          />
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

              <TablePagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TrackerDevices;
