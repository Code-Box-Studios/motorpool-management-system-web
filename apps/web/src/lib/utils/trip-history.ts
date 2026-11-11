import type { TripTicket } from '@/lib/types';
import type { TripDateRow } from '@/lib/api/trip-tickets';

export interface TripHistoryEntry {
  key: string;
  ticket: TripTicket;
  date: TripDateRow;
  status: 'completed' | 'cancelled' | 'departure' | 'return';
  occurredAt: string;
}

const newestFirst = (a: TripHistoryEntry, b: TripHistoryEntry) =>
  new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime() ||
  a.key.localeCompare(b.key);

export function driverTripHistory(tickets: TripTicket[], driverId?: string) {
  if (!driverId) return [];
  return tickets
    .filter(
      (ticket) =>
        ticket.driver_id === driverId && ticket.status !== 'disapproved'
    )
    .flatMap((ticket) =>
      ticket.dates.flatMap((date): TripHistoryEntry[] => {
        // A returned outing stays completed even if the ticket's later outings
        // were cancelled. Dates with missing mileage still belong in history.
        const status =
          date.status === 'completed'
            ? 'completed'
            : date.status === 'cancelled' || ticket.status === 'cancelled'
              ? 'cancelled'
              : undefined;
        if (!status) return [];
        return [
          {
            key: `${ticket.id}:${date.id}`,
            ticket,
            date,
            status,
            occurredAt:
              status === 'completed'
                ? (date.post_trip_checked_at ?? date.end_ts)
                : date.start_ts
          }
        ];
      })
    )
    .sort(newestFirst);
}

export function guardScanHistory(tickets: TripTicket[], guardId?: string) {
  if (!guardId) return [];
  return tickets
    .flatMap((ticket) =>
      ticket.dates.flatMap((date) => {
        const entries: TripHistoryEntry[] = [];
        if (
          (date.pre_trip_checked_by ?? date.pre_trip_guard) === guardId &&
          date.pre_trip_checked_at
        )
          entries.push({
            key: `${ticket.id}:${date.id}:departure`,
            ticket,
            date,
            status: 'departure',
            occurredAt: date.pre_trip_checked_at
          });
        if (
          (date.post_trip_checked_by ?? date.post_trip_guard) === guardId &&
          date.post_trip_checked_at
        )
          entries.push({
            key: `${ticket.id}:${date.id}:return`,
            ticket,
            date,
            status: 'return',
            occurredAt: date.post_trip_checked_at
          });
        return entries;
      })
    )
    .sort(newestFirst);
}

export const historyTime = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString('en-PH', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    : 'Not recorded';
