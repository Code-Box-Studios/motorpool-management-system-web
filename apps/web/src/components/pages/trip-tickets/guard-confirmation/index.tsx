import { gateOuting } from './outings';
import { useRef, useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { CheckCircle2, QrCode } from 'lucide-react';
import { matchesSearch } from '@mms/shared';
import { useAllTripTickets } from '@/lib/query/trip-tickets';
import { useAllVehicles } from '@/lib/query/vehicles';
import { useAllDrivers } from '@/lib/query/drivers';
import {
  useCheckOutTripTicket,
  useCheckInTripTicket
} from '@/lib/mutation/trip-tickets';
import { useListControls } from '@/hooks/use-list-controls';
import { useAuth } from '@/hooks/use-auth';
import { useUserRole } from '@/hooks/use-user-role';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@/components/ui/table';
import ListToolbar from '@/components/shared/list-toolbar';
import ListSearchInput from '@/components/shared/list-search-input';
import TableFilters from '@/components/shared/table-filters';
import TablePagination from '@/components/shared/table-pagination';
import { formatRef } from '@/lib/utils/reference';
import type { TripTicket } from '@/lib/types';

const when = (value: string) =>
  new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit'
  });

/** The guard verifies ticket identity; the server resolves and stamps its eligible outing. */
export default function GuardConfirmationPage() {
  const { user } = useAuth();
  const { data: role } = useUserRole();
  const branchId =
    role?.branch_id || user?.user_metadata?.branch_id || undefined;
  const {
    data: tickets = [],
    isLoading,
    error
  } = useAllTripTickets(undefined, branchId);
  const { data: vehicles = [] } = useAllVehicles();
  const { data: drivers = [] } = useAllDrivers();
  const checkOut = useCheckOutTripTicket();
  const checkIn = useCheckInTripTicket();
  const { search, setSearch, filters, setFilter, clearFilters, page, setPage } =
    useListControls(['gateStatus']);
  const [ticket, setTicket] = useState<TripTicket | null>(null);
  const [verified, setVerified] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scannerKey, setScannerKey] = useState(0);
  const actionButton = useRef<HTMLButtonElement | null>(null);
  const submitting = useRef(false);
  const pending = checkIn.isPending || checkOut.isPending;
  const vehicleOf = (id: string) =>
    vehicles.find((vehicle) => vehicle.id === id);
  const driverOf = (id: string) =>
    drivers.find((driver) => driver.id === id)?.full_name ?? 'Unknown driver';
  const outingOf = (item: TripTicket) =>
    gateOuting(item.status ?? '', item.dates);
  const atGate = tickets.filter((item) =>
    ['approved', 'in_progress'].includes(item.status ?? '')
  );
  const filtered = atGate.filter(
    (item) =>
      (!filters.gateStatus || item.status === filters.gateStatus) &&
      matchesSearch(search, [
        formatRef('TT', item.ticket_no),
        item.destination,
        driverOf(item.driver_id),
        vehicleOf(item.vehicle_id)?.license_plate
      ])
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pages);
  const visibleTickets = filtered.slice(
    (currentPage - 1) * 10,
    currentPage * 10
  );
  const gateLabel = (item: TripTicket) =>
    item.status === 'in_progress' ? 'Out on trip' : 'Ready to depart';
  const openScan = (item: TripTicket, trigger: HTMLButtonElement) => {
    actionButton.current = trigger;
    setTicket(item);
    setVerified(false);
    setScanError('');
    submitting.current = false;
  };
  const confirm = () => {
    if (!ticket || !verified || pending || submitting.current) return;
    submitting.current = true;
    const mutation = ticket.status === 'in_progress' ? checkIn : checkOut;
    mutation.mutate(
      { id: ticket.id },
      {
        onSuccess: () => setTicket(null),
        onSettled: () => {
          submitting.current = false;
        }
      }
    );
  };
  return (
    <div className="mx-auto w-full max-w-7xl min-w-0 space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Next at gate</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Scan the driver's ticket QR to record departure or return. Drivers
            record odometers separately.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-3 lg:min-w-72">
          {[
            [
              'Ready to depart',
              atGate.filter((item) => item.status === 'approved').length
            ],
            [
              'Out on trip',
              atGate.filter((item) => item.status === 'in_progress').length
            ]
          ].map(([label, count]) => (
            <div
              key={label}
              className="bg-card border-border rounded-2xl border px-4 py-3"
            >
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {isLoading ? '—' : count}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <Card className="min-w-0">
        <CardContent className="min-w-0 space-y-4 px-4 sm:px-6 [&_[data-slot=list-toolbar]_button]:min-h-11 [&_[data-slot=list-toolbar]_input]:min-h-11 [&_[data-slot=table-container]]:max-w-full [&>div:last-child_button]:min-h-11">
          <ListToolbar
            searchControl={
              <ListSearchInput
                value={search}
                onChange={setSearch}
                label="Search trips"
              />
            }
            filterControl={
              <TableFilters
                filters={[
                  {
                    key: 'gateStatus',
                    label: 'Gate status',
                    options: [
                      { value: 'approved', label: 'Ready to depart' },
                      { value: 'in_progress', label: 'Out on trip' }
                    ]
                  }
                ]}
                values={filters}
                onChange={setFilter}
                onClear={clearFilters}
              />
            }
          />
          {isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : error ? (
            <p role="alert">Unable to load gate trips. {error.message}</p>
          ) : (
            <>
              <ul
                aria-label="Gate trips"
                className="grid min-w-0 gap-3 sm:grid-cols-2 lg:hidden"
              >
                {visibleTickets.map((item) => {
                  const outing = outingOf(item);
                  const vehicle = vehicleOf(item.vehicle_id);
                  return (
                    <li
                      key={item.id}
                      className="border-border bg-background flex min-w-0 flex-col gap-4 rounded-2xl border p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="font-mono text-sm font-semibold">
                          {formatRef('TT', item.ticket_no)}
                        </h2>
                        <span className="bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-medium">
                          {gateLabel(item)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold break-words">
                          {vehicle?.license_plate ?? 'Vehicle not assigned'}
                        </p>
                        <p className="text-muted-foreground mt-1 text-sm break-words">
                          {driverOf(item.driver_id)}
                        </p>
                      </div>
                      <dl className="grid min-w-0 gap-3 text-sm">
                        <div>
                          <dt className="text-muted-foreground text-xs">
                            Destination
                          </dt>
                          <dd className="mt-1 break-words">
                            {item.destination}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground text-xs">
                            Outing window
                          </dt>
                          <dd className="mt-1">
                            {outing ? (
                              <>
                                {when(outing.start_ts)}
                                <span className="text-muted-foreground mt-1 block">
                                  Return {when(outing.end_ts)}
                                </span>
                              </>
                            ) : (
                              'No eligible outing today'
                            )}
                          </dd>
                        </div>
                      </dl>
                      <Button
                        className="mt-auto min-h-11 w-full"
                        onClick={(event) => openScan(item, event.currentTarget)}
                      >
                        <QrCode aria-hidden="true" className="size-4" />
                        {item.status === 'in_progress'
                          ? 'Scan QR to time in'
                          : 'Scan QR to time out'}
                      </Button>
                    </li>
                  );
                })}
                {filtered.length === 0 && (
                  <li className="text-muted-foreground col-span-full py-8 text-center text-sm">
                    {atGate.length === 0
                      ? 'No trips waiting at the gate.'
                      : 'No matching trips at the gate.'}
                  </li>
                )}
              </ul>
              <div className="hidden min-w-0 lg:block">
                <Table className="min-w-[1000px]">
                  <TableHeader>
                    <TableRow>
                      {[
                        'Trip ticket',
                        'Outing window',
                        'Driver',
                        'Plate',
                        'Destination',
                        'Gate status',
                        'QR action'
                      ].map((heading) => (
                        <TableHead key={heading}>{heading}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleTickets.map((item) => {
                      const outing = outingOf(item);
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-xs">
                            {formatRef('TT', item.ticket_no)}
                          </TableCell>
                          <TableCell>
                            {outing ? (
                              <>
                                <div>{when(outing.start_ts)}</div>
                                <div className="text-muted-foreground text-xs">
                                  Return {when(outing.end_ts)}
                                </div>
                              </>
                            ) : (
                              'No eligible outing today'
                            )}
                          </TableCell>
                          <TableCell>{driverOf(item.driver_id)}</TableCell>
                          <TableCell>
                            {vehicleOf(item.vehicle_id)?.license_plate ??
                              'Not assigned'}
                          </TableCell>
                          <TableCell className="max-w-64 truncate">
                            {item.destination}
                          </TableCell>
                          <TableCell>
                            <span className="bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-medium">
                              {gateLabel(item)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button
                              className="min-h-11"
                              onClick={(event) =>
                                openScan(item, event.currentTarget)
                              }
                            >
                              <QrCode className="size-4" />
                              {item.status === 'in_progress'
                                ? 'Scan QR to time in'
                                : 'Scan QR to time out'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-muted-foreground py-10 text-center"
                        >
                          No matching trips at the gate.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <TablePagination
                page={currentPage}
                totalPages={pages}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={ticket !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setTicket(null);
        }}
      >
        <DialogContent
          className="p-4 sm:max-w-md sm:p-6 [&>[data-slot=dialog-close]]:top-2 [&>[data-slot=dialog-close]]:right-2 [&>[data-slot=dialog-close]]:flex [&>[data-slot=dialog-close]]:size-11 [&>[data-slot=dialog-close]]:items-center [&>[data-slot=dialog-close]]:justify-center"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            actionButton.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {ticket?.status === 'in_progress'
                ? 'Scan to time in'
                : 'Scan to time out'}
            </DialogTitle>
            <DialogDescription>
              Scan the QR on{' '}
              {ticket ? formatRef('TT', ticket.ticket_no) : 'the trip ticket'}.
              Odometer readings are optional and recorded by the assigned
              driver.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {ticket && (
              <div className="bg-card border-border space-y-1 rounded-xl border p-3 text-sm">
                <p className="font-semibold break-words">
                  {vehicleOf(ticket.vehicle_id)?.license_plate ??
                    'Vehicle not assigned'}{' '}
                  · {driverOf(ticket.driver_id)}
                </p>
                <p className="text-muted-foreground break-words">
                  {ticket.destination}
                </p>
              </div>
            )}
            {!verified && (
              <div className="mx-auto aspect-square w-full max-w-[min(18rem,35dvh)] overflow-hidden rounded-xl border bg-black [&_svg]:size-11">
                <Scanner
                  key={scannerKey}
                  constraints={{ facingMode: 'environment' }}
                  onScan={(codes) => {
                    const scanned = codes[0]?.rawValue
                      ?.trim()
                      .toLowerCase()
                      .match(
                        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
                      )?.[0];
                    if (scanned === ticket?.id.toLowerCase()) {
                      setVerified(true);
                      setScanError('');
                    } else
                      setScanError(
                        'That QR code does not match the selected trip ticket.'
                      );
                  }}
                  onError={() =>
                    setScanError(
                      'Cannot reach the camera. Allow camera access and try again.'
                    )
                  }
                  styles={{
                    container: { width: '100%', height: '100%' },
                    video: { width: '100%', height: '100%', objectFit: 'cover' }
                  }}
                />
              </div>
            )}
            {verified && (
              <div
                role="status"
                className="bg-primary/10 text-primary flex items-start gap-3 rounded-xl p-4 text-sm font-medium"
              >
                <CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />
                <p>
                  QR verified. Confirm{' '}
                  {ticket?.status === 'in_progress'
                    ? 'time in to record the return.'
                    : 'time out to record the departure.'}
                </p>
              </div>
            )}
            {scanError && (
              <div className="space-y-3">
                <p role="alert" className="text-destructive text-sm">
                  {scanError}
                </p>
                <Button
                  variant="outline"
                  className="min-h-11 w-full"
                  onClick={() => {
                    setScanError('');
                    setScannerKey((key) => key + 1);
                  }}
                >
                  Retry camera
                </Button>
              </div>
            )}
            {(checkIn.error || checkOut.error) && (
              <p role="alert" className="text-destructive text-sm">
                {(checkIn.error || checkOut.error)?.message}
              </p>
            )}
          </DialogBody>
          <DialogFooter className="grid flex-none grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={pending}
              onClick={() => setTicket(null)}
            >
              Cancel
            </Button>
            <Button
              className="min-h-11"
              disabled={!verified || pending}
              onClick={confirm}
            >
              {pending
                ? 'Recording…'
                : ticket?.status === 'in_progress'
                  ? 'Time in'
                  : 'Time out'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
