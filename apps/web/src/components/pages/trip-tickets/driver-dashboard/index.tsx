import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import QRCode from 'react-qr-code';
import { QrCode, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useAllDrivers } from '@/lib/query/drivers';
import { useAllVehicles } from '@/lib/query/vehicles';
import { useTripTickets } from '@/lib/query/trip-tickets';
import { TRIP_TICKET_STATUS } from '@/lib/enums';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/shared/page-header';
import StatusBadge from '@/components/shared/status-badge';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { formatRef } from '@/lib/utils/reference';
import { useBreadcrumbLabel } from '@/hooks/use-breadcrumb';

const timeOf = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Not set';

// The driver keeps the rail (Dashboard, Job Orders, Tools), so the URL stays
// /dashboard — but five roles share that URL and see five different screens.
// The page names itself, in the body and in the crumb.
const PAGE_TITLE = 'My Trips';
const PAGE_DESCRIPTION =
  'Your next trip, and the QR the guard scans at the gate.';

/**
 * The driver is in or beside a vehicle, on a phone. Their job here is small and
 * specific: know which trip is next, and show the QR the guard scans at the
 * gate. So the next trip takes the screen and the QR is one big button.
 */
const DriverDashboard = () => {
  const { user } = useAuth();
  const [qrTicketId, setQrTicketId] = useState<string | null>(null);

  useBreadcrumbLabel(PAGE_TITLE);

  const { data: drivers, isLoading: driversLoading } = useAllDrivers();
  const { data: vehicles } = useAllVehicles();

  const currentDriver = useMemo(() => {
    if (!user?.email || !drivers) return null;
    const email = user.email.trim().toLowerCase();
    return drivers.find((d) => d.email.trim().toLowerCase() === email) ?? null;
  }, [user?.email, drivers]);

  const { data: tripTicketsData, isLoading: ticketsLoading } = useTripTickets(
    1,
    100,
    undefined,
    undefined,
    currentDriver?.id
  );

  const vehicleOf = (vehicleId: string | null | undefined) =>
    vehicleId ? vehicles?.find((v) => v.id === vehicleId) : undefined;

  // Trips still ahead of the driver, soonest first; finished ones drop away.
  const trips = useMemo(() => {
    const open = (tripTicketsData?.data ?? []).filter(
      (t) =>
        t.status !== TRIP_TICKET_STATUS.COMPLETED &&
        t.status !== TRIP_TICKET_STATUS.CANCELLED &&
        t.status !== TRIP_TICKET_STATUS.DISAPPROVED
    );
    return open.sort(
      (a, b) =>
        new Date(a.start_ts ?? 0).getTime() -
        new Date(b.start_ts ?? 0).getTime()
    );
  }, [tripTicketsData?.data]);

  if (driversLoading || ticketsLoading) {
    return (
      <div className="mx-auto w-full max-w-md">
        <PageHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} />
        <Skeleton className="h-72 w-full rounded-[24px]" />
      </div>
    );
  }

  if (!currentDriver) {
    return (
      <div className="mx-auto w-full max-w-md">
        <PageHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} />
        <div className="border-border text-muted-foreground rounded-[24px] border border-dashed p-10 text-center text-sm">
          We couldn&apos;t find a driver record for your account. Ask an admin
          to link it.
        </div>
      </div>
    );
  }

  const [next, ...later] = trips;
  const qrTicket = qrTicketId
    ? trips.find((t) => t.id === qrTicketId)
    : undefined;

  return (
    <div className="mx-auto w-full max-w-md">
      <PageHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} />

      {!next ? (
        <div className="border-border text-muted-foreground rounded-[24px] border border-dashed p-12 text-center text-sm">
          No trips assigned to you right now.
        </div>
      ) : (
        <>
          {/* ---------- The next trip ---------- */}
          <div className="mb-3 flex items-center gap-2">
            <span className="bg-signal size-2 rounded-full" />
            <span className="text-muted-foreground text-xs font-bold tracking-[0.11em] uppercase">
              Next trip
            </span>
          </div>

          <section className="bg-card border-border rounded-[24px] border p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between gap-3">
              <StatusBadge status={next.status ?? ''} />
              <span className="text-muted-foreground font-mono text-xs">
                {formatRef('TT', next.ticket_no)}
              </span>
            </div>

            <h2 className="text-2xl font-semibold tracking-tight break-words">
              {next.destination}
            </h2>
            <p className="text-slate mt-1 text-sm break-words">
              {next.purpose}
            </p>

            <div className="bg-border my-5 h-px" />

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground flex-none">Vehicle</dt>
                <dd className="min-w-0 text-right font-medium">
                  {(() => {
                    const v = vehicleOf(next.vehicle_id);
                    return v ? (
                      <>
                        {v.make} {v.model}{' '}
                        <span className="font-mono text-xs">
                          {v.license_plate}
                        </span>
                      </>
                    ) : (
                      'Not assigned'
                    );
                  })()}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground flex-none">Depart</dt>
                <dd className="min-w-0 text-right font-medium">
                  {timeOf(next.start_ts)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground flex-none">Return</dt>
                <dd className="min-w-0 text-right font-medium">
                  {timeOf(next.end_ts)}
                </dd>
              </div>
            </dl>

            {/* The driver's whole job at the gate: show this. */}
            <Button
              onClick={() => setQrTicketId(next.id)}
              className="mt-6 h-16 w-full rounded-[22px] text-lg font-semibold"
            >
              <QrCode className="size-5" />
              Show my QR at the gate
            </Button>
            <Button variant="ghost" className="mt-2 w-full" asChild>
              <Link
                to="/trip-tickets/$id"
                params={{ id: next.id }}
                search={{ viewOnly: true }}
              >
                View trip details
              </Link>
            </Button>
          </section>

          {/* ---------- Later ---------- */}
          {later.length > 0 && (
            <section className="mt-7">
              <div className="text-muted-foreground mb-2.5 px-1 text-xs font-bold tracking-[0.11em] uppercase">
                Later
              </div>
              <ul className="flex flex-col gap-2.5">
                {later.map((ticket) => (
                  <li
                    key={ticket.id}
                    className="bg-card border-border flex items-center gap-3 rounded-[18px] border p-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">
                        {ticket.destination}
                      </div>
                      <div className="text-slate truncate text-xs">
                        {timeOf(ticket.start_ts)}
                      </div>
                    </div>
                    <StatusBadge status={ticket.status ?? ''} />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setQrTicketId(ticket.id)}
                    >
                      <QrCode />
                      <span className="sr-only">Show QR</span>
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* ---------- The QR the guard scans ---------- */}
      <AlertDialog
        open={!!qrTicketId}
        onOpenChange={(open) => {
          if (!open) setQrTicketId(null);
        }}
      >
        {/* Capped only from `sm` up: an unprefixed max-w would override the
            dialog's own max-w-[calc(100%-2rem)] and leave a phone with no
            side gutter. */}
        <AlertDialogContent className="sm:max-w-sm">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3"
            onClick={() => setQrTicketId(null)}
          >
            <X />
            <span className="sr-only">Close</span>
          </Button>
          <AlertDialogHeader>
            <AlertDialogTitle>Show this to the guard</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {qrTicket && (
              <>
                {/* The guard's scanner reads the id; the driver reads the ref.
                    The quiet zone stays white in both themes — a scanner cannot
                    resolve the code against a dark surface. The SVG is sized in
                    CSS, not by `size`, so it shrinks on a narrow phone instead
                    of overflowing the dialog. */}
                <div className="w-full max-w-[280px] rounded-[20px] border bg-white p-5">
                  <QRCode
                    value={qrTicket.id}
                    size={240}
                    style={{ width: '100%', height: 'auto' }}
                  />
                </div>
                <span className="text-muted-foreground font-mono text-sm">
                  {formatRef('TT', qrTicket.ticket_no)}
                </span>
              </>
            )}
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DriverDashboard;
