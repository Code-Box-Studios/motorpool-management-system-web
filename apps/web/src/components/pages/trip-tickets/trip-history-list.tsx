import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, History } from 'lucide-react';
import { matchesSearch } from '@mms/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import StatusBadge from '@/components/shared/status-badge';
import ListToolbar from '@/components/shared/list-toolbar';
import ListSearchInput from '@/components/shared/list-search-input';
import TableFilters from '@/components/shared/table-filters';
import TablePagination from '@/components/shared/table-pagination';
import { formatRef } from '@/lib/utils/reference';
import { historyTime, type TripHistoryEntry } from '@/lib/utils/trip-history';

export function TripHistoryList({
  entries,
  mode,
  vehicleLabel,
  driverLabel,
  loading,
  error,
  onRetry,
  renderRecovery
}: {
  entries: TripHistoryEntry[];
  mode: 'driver' | 'guard';
  vehicleLabel: (id: string) => string;
  driverLabel?: (id: string) => string;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  renderRecovery?: (entry: TripHistoryEntry) => ReactNode;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const guard = mode === 'guard';
  const title = guard ? 'My scan history' : 'Trip history';
  const filtered = entries.filter(
    (entry) =>
      (!status || entry.status === status) &&
      matchesSearch(search, [
        formatRef('TT', entry.ticket.ticket_no),
        entry.ticket.destination,
        entry.ticket.purpose,
        vehicleLabel(entry.ticket.vehicle_id),
        driverLabel?.(entry.ticket.driver_id),
        entry.status,
        entry.date.cancellation_reason ?? entry.ticket.cancellation_reason
      ])
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const current = Math.min(page, pages);
  const mileage = (value: number | null) =>
    value === null ? 'Not recorded' : `${value.toLocaleString()} km`;

  return (
    <section aria-label={title} className="min-w-0 space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-slate mt-1 text-sm leading-relaxed">
          {guard
            ? 'Departures and returns you confirmed at the gate. Times are in Philippine time.'
            : 'Your completed outings and cancelled assignments, newest first. Times are in Philippine time.'}
        </p>
      </div>
      {loading ? (
        <Skeleton className="h-56 w-full" />
      ) : error ? (
        <div
          role="alert"
          className="border-border bg-card space-y-3 rounded-2xl border p-5"
        >
          <p className="text-sm">Unable to load history. {error.message}</p>
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <ListToolbar
            viewControl={
              <p className="text-slate text-sm" aria-live="polite">
                {filtered.length} {guard ? 'confirmed scans' : 'outings'}
              </p>
            }
            searchControl={
              <ListSearchInput
                value={search}
                label={`Search ${title.toLowerCase()}`}
                onChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
              />
            }
            filterControl={
              <TableFilters
                filters={[
                  {
                    key: 'status',
                    label: guard ? 'Scan type' : 'Status',
                    options: guard
                      ? [
                          { value: 'departure', label: 'Departures' },
                          { value: 'return', label: 'Returns' }
                        ]
                      : [
                          { value: 'completed', label: 'Completed' },
                          { value: 'cancelled', label: 'Cancelled' }
                        ]
                  }
                ]}
                values={{ status }}
                onChange={(_key, value) => {
                  setStatus(value);
                  setPage(1);
                }}
                onClear={() => {
                  setStatus('');
                  setPage(1);
                }}
              />
            }
          />
          <div className="space-y-3">
            {filtered.slice((current - 1) * 10, current * 10).map((entry) => {
              const { ticket, date } = entry;
              const reason =
                date.cancellation_reason ?? ticket.cancellation_reason;
              const values = guard
                ? [
                    ['Confirmed at', historyTime(entry.occurredAt)],
                    [
                      'Driver',
                      driverLabel?.(ticket.driver_id) ?? 'Driver not available'
                    ],
                    ['Vehicle', vehicleLabel(ticket.vehicle_id)]
                  ]
                : [
                    ['Vehicle', vehicleLabel(ticket.vehicle_id)],
                    ['Time out', historyTime(date.pre_trip_checked_at)],
                    ['Time in', historyTime(date.post_trip_checked_at)],
                    ['Before trip', mileage(date.start_mileage)],
                    ['After trip', mileage(date.end_mileage)],
                    [
                      'Distance',
                      date.start_mileage !== null &&
                      date.end_mileage !== null &&
                      date.end_mileage >= date.start_mileage
                        ? `${(date.end_mileage - date.start_mileage).toLocaleString()} km`
                        : 'Not recorded'
                    ]
                  ];
              return (
                <article
                  key={entry.key}
                  className="border-border bg-card min-w-0 rounded-2xl border p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate font-mono text-xs">
                      {formatRef('TT', ticket.ticket_no)}
                    </span>
                    {guard ? (
                      <span className="bg-status-done-bg text-status-done-fg inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium">
                        {entry.status === 'departure' ? (
                          <ArrowUpRight
                            aria-hidden="true"
                            className="size-3.5"
                          />
                        ) : (
                          <ArrowDownLeft
                            aria-hidden="true"
                            className="size-3.5"
                          />
                        )}
                        {entry.status === 'departure'
                          ? 'Departure confirmed'
                          : 'Return confirmed'}
                      </span>
                    ) : (
                      <StatusBadge status={entry.status} />
                    )}
                  </div>
                  <h3 className="mt-3 font-semibold break-words">
                    {ticket.destination || 'Destination not recorded'}
                  </h3>
                  <p className="text-slate mt-1 text-sm leading-relaxed">
                    {historyTime(date.start_ts)} – {historyTime(date.end_ts)}
                  </p>
                  <dl className="border-border mt-4 grid grid-cols-1 gap-4 border-t pt-4 min-[380px]:grid-cols-2 lg:grid-cols-3">
                    {values.map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-slate text-xs">{label}</dt>
                        <dd className="mt-1 text-sm font-medium break-words">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {entry.status === 'cancelled' && reason && (
                    <p className="text-slate border-border mt-4 border-t pt-3 text-sm leading-relaxed break-words">
                      <span className="text-foreground font-medium">
                        Cancellation reason:{' '}
                      </span>
                      {reason}
                    </p>
                  )}
                  {!guard &&
                    entry.status === 'completed' &&
                    (date.start_mileage === null ||
                      date.end_mileage === null) && (
                      <div>
                        <p className="text-status-wait-fg mt-3 text-xs">
                          Odometer readings are incomplete.
                        </p>
                        {renderRecovery?.(entry)}
                      </div>
                    )}
                  <div className="mt-3 flex justify-end">
                    <Button
                      variant="ghost"
                      className="h-11 rounded-lg px-3"
                      asChild
                    >
                      <Link
                        to="/trip-tickets/$id"
                        params={{ id: ticket.id }}
                        search={{ viewOnly: true }}
                      >
                        Trip details
                        <ArrowRight aria-hidden="true" className="size-4" />
                      </Link>
                    </Button>
                  </div>
                </article>
              );
            })}
            {filtered.length === 0 && (
              <div className="border-border text-slate rounded-2xl border border-dashed px-5 py-10 text-center">
                <History aria-hidden="true" className="mx-auto mb-3 size-6" />
                <p className="text-sm">
                  {entries.length
                    ? 'No history matches your search or filters.'
                    : guard
                      ? 'No confirmed scans yet.'
                      : 'No completed or cancelled trips yet.'}
                </p>
              </div>
            )}
          </div>
          <TablePagination
            page={current}
            totalPages={pages}
            onPageChange={setPage}
          />
        </>
      )}
    </section>
  );
}
