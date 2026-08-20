// A trip ticket can now cover several non-consecutive dates — an event on the
// 17th AND the 21st — and each one is its own outing with its own gate cycle:
// its own odometer reading out and back, its own guard, and its own status.
// The ticket-level "Pre-Trip Guard"/"Post-Trip Guard" fields this replaces
// could only ever describe ONE outing, so on a multi-date ticket they were
// already a lie by omission; the API stopped writing them and this table is
// where that information actually lives now.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/components/shared/status-badge';
import { DetailSection } from '@/components/shared/detail-view';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { ReasonDialog } from '../transition-dialogs';
import { useCancelTripDate } from '@/lib/mutation/trip-tickets';
import type { TripDateRow } from '@/lib/api/trip-tickets';
import { TRIP_TICKET_STATUS } from '@/lib/enums';

const dayOf = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

const timeOf = (value: string) =>
  new Date(value).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  });

const windowOf = (start: string, end: string) =>
  `${timeOf(start)} – ${timeOf(end)}`;

const odometerOf = (value: number | null) =>
  value === null ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    `${value.toLocaleString()} km`
  );

interface TripDatesSectionProps {
  ticketId: string;
  dates: TripDateRow[];
  /** The TICKET's own status — the per-date cancel endpoint is only legal
   *  while it is `approved` or `in_progress`, regardless of a given date's
   *  own status. */
  ticketStatus: string;
  /** Admin or the owning requester — the only actors the cancel endpoint
   *  accepts (403 NOT_TICKET_OWNER otherwise). */
  canManage: boolean;
  /** Resolves a user id to a display name, e.g. a guard's. */
  personName: (userId: string | null | undefined) => string | undefined;
}

// Each date is its own outing — its own gate cycle, its own status, its own
// odometer pair — so it gets its own row rather than folding into the ticket
// header. A `scheduled` row gets a Cancel button, but only when the API would
// actually accept it: ticket approved/in_progress AND the row itself still
// scheduled AND the viewer is an admin or the ticket's own requester. Offering
// it anywhere else is a button that always 409s.
export function TripDatesSection({
  ticketId,
  dates,
  ticketStatus,
  canManage,
  personName
}: TripDatesSectionProps) {
  const [cancellingDateId, setCancellingDateId] = useState<string | null>(null);
  const cancelTripDate = useCancelTripDate();

  const ticketAllowsCancel =
    ticketStatus === TRIP_TICKET_STATUS.APPROVED ||
    ticketStatus === TRIP_TICKET_STATUS.IN_PROGRESS;
  // Without this, an admin looking at an approved ticket whose every date is
  // already in_progress/completed/cancelled would still get an Actions column
  // — header and all — with nothing but empty cells underneath it, since no
  // row would ever pass the `status === 'scheduled'` check below.
  const hasCancellableDate = dates.some((d) => d.status === 'scheduled');
  const showActionsColumn =
    canManage && ticketAllowsCancel && hasCancellableDate;

  return (
    <DetailSection
      title="Dates"
      description={
        dates.length > 0
          ? 'Each date is its own outing, with its own gate cycle.'
          : undefined
      }
    >
      {dates.length === 0 ? (
        // Legacy tickets from before this feature got no backfill row — an
        // empty table with headers and no rows would look broken, not empty.
        <p className="text-muted-foreground text-sm">
          No dates recorded for this trip ticket.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Window</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Odometer Out</TableHead>
              <TableHead>Odometer In</TableHead>
              <TableHead>Guard Out</TableHead>
              <TableHead>Guard In</TableHead>
              {showActionsColumn && (
                <TableHead className="text-right">Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {dates.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium whitespace-nowrap">
                  {dayOf(d.start_ts)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {windowOf(d.start_ts, d.end_ts)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={d.status} />
                  {d.status === 'cancelled' && d.cancellation_reason && (
                    <p className="text-muted-foreground mt-1 max-w-[220px] text-xs text-wrap">
                      {d.cancellation_reason}
                    </p>
                  )}
                </TableCell>
                <TableCell>{odometerOf(d.start_mileage)}</TableCell>
                <TableCell>{odometerOf(d.end_mileage)}</TableCell>
                <TableCell>
                  {personName(d.pre_trip_guard) ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {personName(d.post_trip_guard) ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                {showActionsColumn && (
                  <TableCell className="text-right">
                    {d.status === 'scheduled' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setCancellingDateId(d.id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ReasonDialog
        open={cancellingDateId !== null}
        onOpenChange={(open) => {
          if (!open) setCancellingDateId(null);
        }}
        title="Cancel This Date"
        description="Please provide a reason for cancelling this outing. If it is the last live date on this ticket, cancelling it cancels the whole trip ticket."
        label="Cancellation Reason *"
        placeholder="Enter reason for cancellation..."
        confirmLabel="Confirm Cancellation"
        isLoading={cancelTripDate.isPending}
        onConfirm={(reason) => {
          if (!cancellingDateId) return;
          cancelTripDate.mutate(
            { ticketId, dateId: cancellingDateId, reason },
            { onSuccess: () => setCancellingDateId(null) }
          );
        }}
      />
    </DetailSection>
  );
}
