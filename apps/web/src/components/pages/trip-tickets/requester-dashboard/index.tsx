import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useAllVehicles } from '@/lib/query/vehicles';
import { useTripTickets } from '@/lib/query/trip-tickets';
import { useCancelTripTicket } from '@/lib/mutation/trip-tickets';
import { TRIP_TICKET_STATUS } from '@/lib/enums';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import StatusBadge from '@/components/shared/status-badge';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { AddTripTicket } from '../add-trip-ticket/form';
import { ReasonDialog } from '../transition-dialogs';
import { formatRef } from '@/lib/utils/reference';
import type { TripDateRow } from '@/lib/api/trip-tickets';

// A section heading: a signal dot and a tracked, uppercase label. Same idiom as
// the other two focus screens, which is what this one sits beside.
const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-3 flex items-center gap-2">
    <span className="bg-signal size-2 rounded-full" />
    <span className="text-muted-foreground text-xs font-bold tracking-[0.11em] uppercase">
      {children}
    </span>
  </div>
);

const timeOf = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Not set';

// "17 Apr, 9:00 AM – 5:00 PM" — one outing, exactly as the requester asked for
// it. A ticket can cover several of these now, non-consecutive, each its own
// gate cycle — this is why "Depart"/"Return" below (the ticket's overall span)
// is no longer the whole story.
const dateWindowOf = (date: TripDateRow) => {
  const start = new Date(date.start_ts);
  const end = new Date(date.end_ts);
  const day = start.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short'
  });
  const time = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time(start)} – ${time(end)}`;
};

// The dates worth leading with: a cancelled outing is no longer part of what
// is actually happening, so it should neither be the headline date nor count
// toward "+N more" — an approved ticket whose first date fell through but
// whose second stands should read by the date that's still on. Falls back to
// every row (still date-ordered) only when the whole ticket's dates are
// cancelled, so a compact row is never left with nothing to show.
const liveDates = (dates: TripDateRow[]): TripDateRow[] => {
  const live = dates.filter((d) => d.status !== 'cancelled');
  return live.length > 0 ? live : dates;
};

// The two states where the request is sitting on someone else's desk. These are
// what the requester opens the page to check, so they get the top of the screen.
const WAITING = [
  TRIP_TICKET_STATUS.PENDING_ADMIN_APPROVAL,
  TRIP_TICKET_STATUS.PENDING_FUEL_ALLOCATION_APPROVAL
] as string[];

// Same allowed-from set as the server's cancel() and as the trip-tickets list's
// requesterActionsFor — both pending states plus `approved`, because a signed-off
// trip that is no longer needed must stay cancellable by the person who asked
// for it. Offering Cancel anywhere else would be a button the API rejects.
const CANCELLABLE = [...WAITING, TRIP_TICKET_STATUS.APPROVED] as string[];

/**
 * A requester does not run the motor pool — they ask it for a van and then wait.
 * So this screen answers exactly two questions: what is still waiting on an
 * approval, and what happened to everything else. Nothing about the fleet, the
 * workshop, or other people's trips appears here; the requester has no business
 * with any of it and the API would refuse them anyway.
 *
 * Rendered in the focus shell (no navigation rail), so the header bar already
 * says "My Requests" — this opens on the count instead of repeating the title.
 */
const RequesterDashboard = () => {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [cancellingTicketId, setCancellingTicketId] = useState<string | null>(
    null
  );

  // The server scopes a requester to `requestedById: actor.id` regardless, but
  // the filter is passed explicitly so the query key changes with the account —
  // otherwise a re-login as someone else would read the first user's cache.
  const { data: ticketsData, isLoading } = useTripTickets(1, 100, user?.id);
  const { data: vehicles } = useAllVehicles();

  const cancelTripTicket = useCancelTripTicket();

  const vehicleLabel = (vehicleId: string | null | undefined) => {
    const vehicle = vehicleId
      ? vehicles?.find((v) => v.id === vehicleId)
      : undefined;
    return vehicle
      ? `${vehicle.make} ${vehicle.model} · ${vehicle.license_plate}`
      : 'Not assigned';
  };

  // Soonest first in both groups: the trip that departs next is the one worth
  // chasing an approval for, and the one most recently travelled is the one
  // being looked up afterwards.
  const { waiting, others } = useMemo(() => {
    const all = [...(ticketsData?.data ?? [])].sort(
      (a, b) =>
        new Date(a.start_ts ?? 0).getTime() -
        new Date(b.start_ts ?? 0).getTime()
    );
    return {
      waiting: all.filter((t) => WAITING.includes(t.status ?? '')),
      others: all.filter((t) => !WAITING.includes(t.status ?? ''))
    };
  }, [ticketsData?.data]);

  const total = waiting.length + others.length;

  // The headline is the answer to "did anything move?", so it counts what is
  // still out for approval — not how many requests exist.
  const headline =
    total === 0
      ? 'No requests yet'
      : waiting.length === 0
        ? 'Nothing waiting on approval'
        : `${waiting.length} request${waiting.length === 1 ? '' : 's'} waiting`;

  return (
    <div className="mx-auto w-full max-w-[880px] md:py-6">
      <SectionLabel>Your trip requests</SectionLabel>

      {isLoading ? (
        <Skeleton className="h-12 w-72" />
      ) : (
        <h1 className="text-3xl font-medium tracking-tight md:text-[44px] md:leading-[1.05]">
          {headline}
        </h1>
      )}
      <p className="text-slate mt-2 text-base">
        Ask for a vehicle, then track where the request has got to. Cancelling
        always asks for a reason.
      </p>

      <Button className="mt-6" onClick={() => setCreateOpen(true)}>
        <Plus className="size-4" />
        Request a trip
      </Button>

      {isLoading ? (
        <div className="mt-10 space-y-4">
          <Skeleton className="h-56 w-full rounded-[24px]" />
          <Skeleton className="h-16 w-full rounded-[18px]" />
        </div>
      ) : (
        <>
          {/* ---------- Waiting on someone ---------- */}
          {waiting.length > 0 && (
            <section className="mt-10">
              <SectionLabel>Waiting on approval</SectionLabel>
              <ul className="flex flex-col gap-4">
                {waiting.map((ticket) => (
                  <li
                    key={ticket.id}
                    className="bg-card border-border rounded-[24px] border p-6 shadow-lg"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <StatusBadge status={ticket.status ?? ''} />
                      <span className="text-muted-foreground font-mono text-xs">
                        {formatRef('TT', ticket.ticket_no)}
                      </span>
                    </div>

                    <h2 className="text-2xl font-semibold tracking-tight break-words">
                      {ticket.destination}
                    </h2>
                    <p className="text-slate mt-1 text-sm break-words">
                      {ticket.purpose}
                    </p>

                    {/* What they actually asked for — every outing on this
                        ticket, not just the overall span. A legacy ticket
                        from before dates existed has none; the Depart/Return
                        pair below still carries it. */}
                    {ticket.dates.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-1.5">
                        {ticket.dates.map((d) => (
                          <li
                            key={d.id}
                            className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-xs font-medium"
                          >
                            {dateWindowOf(d)}
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="bg-border my-5 h-px" />

                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground flex-none">
                          Vehicle
                        </dt>
                        <dd className="min-w-0 text-right font-medium">
                          {vehicleLabel(ticket.vehicle_id)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground flex-none">
                          Depart
                        </dt>
                        <dd className="min-w-0 text-right font-medium">
                          {timeOf(ticket.start_ts)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground flex-none">
                          Return
                        </dt>
                        <dd className="min-w-0 text-right font-medium">
                          {timeOf(ticket.end_ts)}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-6 flex flex-wrap gap-2">
                      <Button variant="outline" asChild>
                        <Link
                          to="/trip-tickets/$id"
                          params={{ id: ticket.id }}
                          search={{ viewOnly: true }}
                        >
                          View request details
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setCancellingTicketId(ticket.id)}
                      >
                        Cancel this request
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ---------- Everything else ---------- */}
          {others.length > 0 && (
            <section className="mt-10">
              <SectionLabel>Other requests</SectionLabel>
              <ul className="flex flex-col gap-2.5">
                {others.map((ticket) => (
                  <li
                    key={ticket.id}
                    className="bg-card border-border flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-[18px] border p-3.5"
                  >
                    <span className="text-ink-soft min-w-16 flex-none font-mono text-sm whitespace-nowrap">
                      {formatRef('TT', ticket.ticket_no)}
                    </span>
                    <div className="min-w-[160px] flex-1">
                      <div className="truncate font-semibold">
                        {ticket.destination}
                      </div>
                      <div className="text-slate truncate text-xs">
                        {(() => {
                          const shown = liveDates(ticket.dates);
                          return shown.length > 0 ? (
                            <>
                              {dateWindowOf(shown[0])}
                              {shown.length > 1 && (
                                <span className="text-muted-foreground">
                                  {' '}
                                  · +{shown.length - 1} more
                                </span>
                              )}
                            </>
                          ) : (
                            timeOf(ticket.start_ts)
                          );
                        })()}
                      </div>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <StatusBadge status={ticket.status ?? ''} />
                      {CANCELLABLE.includes(ticket.status ?? '') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setCancellingTicketId(ticket.id)}
                        >
                          Cancel
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" asChild>
                        <Link
                          to="/trip-tickets/$id"
                          params={{ id: ticket.id }}
                          search={{ viewOnly: true }}
                        >
                          View
                        </Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* ---------- Request a trip ---------- */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Request Trip Ticket</DialogTitle>
            <DialogDescription>
              Submit a trip ticket request for admin approval.
            </DialogDescription>
          </DialogHeader>
          {/* Remounted each time it opens, so a dismissed half-filled request is
              not still sitting there the next time someone starts one. */}
          <DialogBody>
            {createOpen && (
              <AddTripTicket onDone={() => setCreateOpen(false)} />
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* ---------- Cancel ---------- */}
      <ReasonDialog
        open={cancellingTicketId !== null}
        onOpenChange={(open) => {
          if (!open) setCancellingTicketId(null);
        }}
        title="Cancel Trip Ticket"
        description="Please provide a reason for cancelling this trip ticket request."
        label="Cancellation Reason *"
        placeholder="Enter reason for cancellation..."
        cancelLabel="No, keep it"
        confirmLabel="Yes, cancel request"
        isLoading={cancelTripTicket.isPending}
        onConfirm={(reason) => {
          if (!cancellingTicketId) return;
          cancelTripTicket.mutate(
            { id: cancellingTicketId, reason },
            { onSuccess: () => setCancellingTicketId(null) }
          );
        }}
      />
    </div>
  );
};

export default RequesterDashboard;
