import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/components/shared/status-badge';
import { formatRef } from '@/lib/utils/reference';
import type { TripTicket } from '@/lib/types';
import { cn } from '@/lib/utils';

const when = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString('en-PH', {
        timeZone: 'Asia/Manila',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    : 'Not set';

export default function RequestCard({
  ticket,
  vehicle,
  driver,
  canCancel,
  onCancel
}: {
  ticket: TripTicket;
  vehicle: string;
  driver: string;
  canCancel: boolean;
  onCancel: (id: string) => void;
}) {
  const reference = formatRef('TT', ticket.ticket_no);
  const live = ticket.dates.filter((date) => date.status !== 'cancelled');
  const dates = live.length ? live : ticket.dates;
  const schedules = dates.length
    ? dates
    : [{ id: ticket.id, start_ts: ticket.start_ts, end_ts: ticket.end_ts }];

  return (
    <article
      aria-label={`${reference} request`}
      className="bg-card border-border hover:border-foreground/25 hover:bg-muted/20 relative isolate min-w-0 rounded-[20px] border p-5 transition-colors sm:p-6"
    >
      <div
        className={cn(
          'grid min-w-0 gap-5 xl:items-center',
          canCancel
            ? 'xl:grid-cols-[minmax(0,1fr)_minmax(260px,360px)_auto]'
            : 'xl:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]'
        )}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-muted-foreground font-mono text-xs">
              {reference}
            </span>
            <StatusBadge status={ticket.status ?? ''} />
          </div>
          <h3 className="mt-2 text-lg font-semibold tracking-tight break-words">
            <Link
              to="/trip-tickets/$id"
              params={{ id: ticket.id }}
              search={{ viewOnly: true }}
              aria-label={`View details for ${reference}: ${ticket.destination}`}
              className="focus-visible:after:ring-ring inline-flex max-w-full items-center gap-2 after:absolute after:inset-0 after:rounded-[20px] focus:outline-none focus-visible:after:ring-2"
            >
              <span className="min-w-0 break-words">{ticket.destination}</span>
              <ChevronRight
                className="text-muted-foreground size-4 shrink-0"
                aria-hidden="true"
              />
            </Link>
          </h3>
          <p className="text-slate mt-1 text-sm leading-relaxed break-words">
            {ticket.purpose || 'No purpose provided'}
          </p>
          <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-relaxed">
            <div className="flex min-w-0 flex-wrap gap-x-1.5">
              <dt className="text-muted-foreground">Vehicle / plate</dt>
              <dd className="min-w-0 break-words">{vehicle}</dd>
            </div>
            <div className="flex min-w-0 flex-wrap gap-x-1.5">
              <dt className="text-muted-foreground">Driver</dt>
              <dd className="min-w-0 break-words">{driver}</dd>
            </div>
          </dl>
        </div>
        <ul
          aria-label="Trip schedule"
          className="border-border min-w-0 divide-y"
        >
          {schedules.map((date) => (
            <li
              key={date.id}
              className="grid grid-cols-2 gap-4 py-1.5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                  Departure
                </p>
                <p className="mt-1 text-sm leading-relaxed break-words">
                  {when(date.start_ts)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                  Return
                </p>
                <p className="mt-1 text-sm leading-relaxed break-words">
                  {when(date.end_ts)}
                </p>
              </div>
            </li>
          ))}
        </ul>
        {canCancel && (
          <div className="border-border flex items-center border-t pt-4 xl:justify-end xl:border-0 xl:pt-0">
            <Button
              variant="ghost"
              className="text-destructive relative z-10 h-11 flex-1 xl:flex-none"
              onClick={() => onCancel(ticket.id)}
              aria-label={`Cancel request ${reference}`}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
