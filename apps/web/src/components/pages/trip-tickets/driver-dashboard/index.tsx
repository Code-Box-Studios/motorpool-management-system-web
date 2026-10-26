import { OdometerActions } from './odometer-actions';
import { useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import QRCode from 'react-qr-code';
import { ArrowRight, CalendarDays, CarFront, QrCode, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useAllDrivers } from '@/lib/query/drivers';
import { useAllVehicles } from '@/lib/query/vehicles';
import { useAllTripTickets } from '@/lib/query/trip-tickets';
import { TRIP_TICKET_STATUS } from '@/lib/enums';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/shared/page-header';
import StatusBadge from '@/components/shared/status-badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
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
  'Your schedule, gate QR and odometer readings in one place.';

/**
 * The driver is in or beside a vehicle, on a phone. Their job here is small and
 * specific: know which trip is next, and show the QR the guard scans at the
 * gate. So the next trip takes the screen and the QR is one big button.
 */
const DriverDashboard = () => {
  const { user } = useAuth();
  const [qrTicketId, setQrTicketId] = useState<string | null>(null);
  const qrTrigger = useRef<HTMLElement | null>(null);
  const showQr = (ticketId: string) => {
    qrTrigger.current = document.activeElement as HTMLElement | null;
    setQrTicketId(ticketId);
  };

  useBreadcrumbLabel(PAGE_TITLE);

  const { data: drivers, isLoading: driversLoading } = useAllDrivers();
  const { data: vehicles } = useAllVehicles();

  const currentDriver = useMemo(() => {
    if (!user?.id || !drivers) return null;
    return drivers.find((d) => d.userId === user.id) ?? null;
  }, [user?.id, drivers]);

  const { data: tripTicketsData, isLoading: ticketsLoading } =
    useAllTripTickets(undefined, undefined, currentDriver?.id);

  const vehicleOf = (vehicleId: string | null | undefined) =>
    vehicleId ? vehicles?.find((v) => v.id === vehicleId) : undefined;

  // A ticket can cover several non-consecutive outings now, each with its own
  // gate cycle — so "next trip" has to be the next OUTING, not the ticket's
  // earliest date. Once the first date of a two-date event is done, the
  // driver's next trip is the second date, which the ticket's own start_ts
  // (its overall span) no longer points at.
  //
  // Flatten every open ticket to one { ticket, date } pair per live outing —
  // a date is "live" while it is neither cancelled nor already completed — and
  // sort those pairs by the DATE's own start, soonest first. A whole
  // cancelled/disapproved ticket is excluded up front: cancelling or
  // disapproving the ticket does not retroactively mark its date rows
  // cancelled, so without this outer filter their still-`scheduled` rows
  // would keep slipping back in.
  const pairs = useMemo(() => {
    const openTickets = (tripTicketsData ?? []).filter(
      (t) =>
        t.status !== TRIP_TICKET_STATUS.CANCELLED &&
        t.status !== TRIP_TICKET_STATUS.DISAPPROVED
    );
    const list = openTickets.flatMap((ticket) =>
      ticket.dates
        .filter(
          (d) =>
            d.status !== 'cancelled' &&
            (d.status !== 'completed' ||
              d.start_mileage === null ||
              d.end_mileage === null)
        )
        .map((date) => ({ ticket, date }))
    );
    return list.sort(
      (a, b) =>
        Number(a.date.status === 'completed') -
          Number(b.date.status === 'completed') ||
        new Date(a.date.start_ts).getTime() -
          new Date(b.date.start_ts).getTime()
    );
  }, [tripTicketsData]);

  if (driversLoading || ticketsLoading) {
    return (
      <div className="w-full min-w-0">
        <PageHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} />
        <Skeleton className="h-72 w-full rounded-[24px]" />
      </div>
    );
  }

  if (!currentDriver) {
    return (
      <div className="w-full min-w-0">
        <PageHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} />
        <div className="border-border text-muted-foreground rounded-[24px] border border-dashed p-10 text-center text-sm">
          We couldn&apos;t find a driver record for your account. Ask an admin
          to link it.
        </div>
      </div>
    );
  }

  const [next, ...later] = pairs;
  // Every pair for the same ticket shares one QR (the ticket id — the gate
  // scans that, then the server resolves which outing it is releasing), so
  // any matching pair's ticket is the right one to show.
  const qrTicket = qrTicketId
    ? (pairs.find((p) => p.ticket.id === qrTicketId)?.ticket ?? undefined)
    : undefined;

  const nextVehicle = next ? vehicleOf(next.ticket.vehicle_id) : undefined;
  const nextApproved = next
    ? ['approved', 'in_progress', 'completed'].includes(
        next.ticket.status ?? ''
      )
    : false;
  const nextIsComplete = next?.date.status === 'completed';
  const nextLabel = nextIsComplete
    ? 'Finish trip readings'
    : next?.date.status === 'in_progress'
      ? 'Current trip'
      : 'Next trip';

  return (
    <div className="w-full min-w-0">
      <PageHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} />

      {!next ? (
        <section className="bg-card border-border rounded-[20px] border p-6 sm:p-10">
          <div className="bg-muted text-muted-foreground mb-4 flex size-12 items-center justify-center rounded-full">
            <CalendarDays className="size-6" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold">No trips assigned right now</h2>
          <p className="text-muted-foreground mt-2 max-w-lg text-sm leading-relaxed">
            Your assigned trips will appear here with their schedule, gate QR
            and odometer actions.
          </p>
        </section>
      ) : (
        <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <section
            aria-label={nextLabel}
            className="bg-card border-border min-w-0 rounded-[20px] border p-5 sm:p-6"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {nextLabel}
              </span>
              <span className="text-muted-foreground font-mono text-xs">
                {formatRef('TT', next.ticket.ticket_no)}
              </span>
            </div>
            <StatusBadge status={next.ticket.status ?? ''} />
            <h2 className="mt-3 text-2xl font-semibold tracking-tight break-words sm:text-3xl">
              {next.ticket.destination || 'Destination not recorded'}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed break-words">
              {next.ticket.purpose || 'Purpose not recorded'}
            </p>

            <div className="border-border my-4 flex items-start gap-3 border-y py-3">
              <CarFront
                className="text-muted-foreground mt-0.5 size-5 shrink-0"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs font-medium">
                  Assigned vehicle
                </p>
                <p className="mt-1 text-sm font-semibold break-words">
                  {nextVehicle
                    ? `${nextVehicle.make} ${nextVehicle.model}`
                    : 'Not assigned'}
                </p>
                {nextVehicle?.license_plate && (
                  <p className="text-muted-foreground mt-1 font-mono text-sm break-all">
                    {nextVehicle.license_plate}
                  </p>
                )}
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-4">
              {[
                { label: 'Departure', value: next.date.start_ts },
                { label: 'Expected return', value: next.date.end_ts }
              ].map(({ label, value }) => (
                <div key={label} className="min-w-0">
                  <dt className="text-muted-foreground text-xs font-medium">
                    {label}
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed font-medium">
                    <time dateTime={value}>{timeOf(value)}</time>
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section
            aria-label="Gate and odometer actions"
            className="bg-card border-border min-w-0 rounded-[20px] border p-5 sm:p-6"
          >
            <h2 className="text-lg font-semibold tracking-tight">
              {nextIsComplete
                ? 'Complete your trip record'
                : 'Ready at the gate'}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {nextIsComplete
                ? 'This outing has returned. Record any missing readings below.'
                : !nextApproved
                  ? 'Awaiting approval. The guard will confirm approval before releasing the vehicle.'
                  : next.date.status === 'in_progress'
                    ? 'Show your QR to the guard when you return.'
                    : 'Show your QR to the guard when leaving and returning.'}
            </p>
            {!nextIsComplete && (
              <Button
                onClick={() => showQr(next.ticket.id)}
                className="mt-5 min-h-14 w-full rounded-xl px-3 py-3 text-base font-semibold whitespace-normal"
              >
                <QrCode className="size-5 shrink-0" />
                Show my QR at the gate
              </Button>
            )}
            <OdometerActions
              ticketId={next.ticket.id}
              date={next.date}
              approved={nextApproved}
            />
            {!nextApproved && (
              <p className="text-muted-foreground border-border mt-5 border-t pt-4 text-sm leading-relaxed">
                Odometer actions become available after the trip is approved.
              </p>
            )}
            {nextIsComplete && (
              <Button
                variant="outline"
                onClick={() => showQr(next.ticket.id)}
                className="mt-4 h-12 w-full"
              >
                <QrCode className="size-5" />
                Show trip QR
              </Button>
            )}
            <Button variant="ghost" className="mt-3 h-12 w-full" asChild>
              <Link
                to="/trip-tickets/$id"
                params={{ id: next.ticket.id }}
                search={{ viewOnly: true }}
              >
                View trip details
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </section>

          {later.length > 0 && (
            <section
              className="min-w-0 xl:col-span-2"
              aria-label="Other assigned outings"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Other assigned outings</h2>
                <span className="text-muted-foreground text-sm">
                  {later.length} {later.length === 1 ? 'outing' : 'outings'}
                </span>
              </div>
              <ul className="grid items-stretch gap-5 lg:grid-cols-2">
                {later.map((pair) => (
                  <li
                    key={`${pair.ticket.id}:${pair.date.id}`}
                    className="bg-card border-border min-w-0 rounded-[20px] border p-5"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-muted-foreground font-mono text-xs">
                        {formatRef('TT', pair.ticket.ticket_no)}
                      </span>
                      <StatusBadge status={pair.ticket.status ?? ''} />
                    </div>
                    <h3 className="font-semibold break-words">
                      {pair.ticket.destination || 'Destination not recorded'}
                    </h3>
                    <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                      {pair.date.status === 'completed'
                        ? 'Returned · '
                        : pair.date.status === 'in_progress'
                          ? 'On the road · '
                          : ''}
                      {timeOf(pair.date.start_ts)}
                    </p>
                    <OdometerActions
                      ticketId={pair.ticket.id}
                      date={pair.date}
                      approved={[
                        'approved',
                        'in_progress',
                        'completed'
                      ].includes(pair.ticket.status ?? '')}
                    />
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        className="h-12 px-2"
                        onClick={() => showQr(pair.ticket.id)}
                      >
                        <QrCode className="size-4 shrink-0" />
                        Show QR
                      </Button>
                      <Button variant="ghost" className="h-12 px-2" asChild>
                        <Link
                          to="/trip-tickets/$id"
                          params={{ id: pair.ticket.id }}
                          search={{ viewOnly: true }}
                        >
                          Trip details
                        </Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <Dialog
        open={!!qrTicketId}
        onOpenChange={(open) => {
          if (!open) setQrTicketId(null);
        }}
      >
        <DialogContent
          className="p-5 sm:max-w-sm sm:p-6"
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            qrTrigger.current?.focus();
          }}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 size-11"
            onClick={() => setQrTicketId(null)}
          >
            <X />
            <span className="sr-only">Close</span>
          </Button>
          <DialogHeader>
            <DialogTitle>Show this to the guard</DialogTitle>
            <DialogDescription>
              The guard scans this QR at the gate.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-col items-center gap-3 overflow-y-auto py-1">
            {qrTicket && (
              <>
                {/* A white quiet zone keeps the QR readable in both themes. */}
                <div className="w-full max-w-[280px] shrink-0 rounded-[20px] border bg-white p-5">
                  <QRCode
                    value={qrTicket.id}
                    size={240}
                    style={{ width: '100%', height: 'auto' }}
                  />
                </div>
                <span className="text-muted-foreground font-mono text-sm">
                  {formatRef('TT', qrTicket.ticket_no)}
                </span>
                <p className="text-center text-sm font-medium break-words">
                  {qrTicket.destination}
                </p>
              </>
            )}
          </div>
          <Button
            variant="outline"
            className="h-12 w-full shrink-0"
            onClick={() => setQrTicketId(null)}
          >
            Done
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DriverDashboard;
