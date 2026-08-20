// This fleet is University of Mindanao — Asia/Manila, UTC+8, no daylight
// saving. Nothing that resolves a wall-clock "today" for a human, or names a
// calendar day in a message, may use the host process's local time: there is
// no `TZ` pinned anywhere in this repo, so that is whatever zone the process
// happens to run in — Asia/Manila on a dev machine, almost certainly UTC in
// the cloud. `Intl.DateTimeFormat` with an IANA zone name is used rather than
// a manual UTC+8 offset add, so this stays correct even if Node's default
// locale/TZ on the host is something else.
//
// Both trip-tickets/service.ts (booking clash messages) and
// trip-tickets/dates.ts (the gate's "is there an outing today" bound) need
// this same zone, so it lives here rather than being defined twice.
export const DISPLAY_TIMEZONE = 'Asia/Manila';

export function formatDisplayDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

function displayDateParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(d);
  const get = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    if (!part)
      throw new Error(`Intl.DateTimeFormat did not return a "${type}" part`);
    return Number(part.value);
  };
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second')
  };
}

/**
 * The last instant of `now`'s calendar day in the display timezone.
 *
 * A prior version used `Date#setHours`, which resolves "today" in the HOST
 * PROCESS's local time, not Manila's. Worked through: a guard checks out a
 * trip at 07:00 Manila on the 17th, which is 23:00 UTC on the 16th. Under a
 * UTC process, the host-local `endOfDay(now)` lands at 23:59:59Z on the
 * 16th — but an 08:00-Manila departure on the 17th starts at 00:00Z on the
 * 17th, LATER than that bound, so the trip would be refused an hour before it
 * leaves. Morning departures are the normal case here, so this cannot be a
 * host-local calculation.
 *
 * Manila carries a fixed +08:00 offset (no DST), so the zone's current offset
 * from UTC — derived once via `Intl.DateTimeFormat`, never hardcoded — applies
 * uniformly across the whole calendar day being bounded.
 */
export function endOfDisplayDay(now: Date): Date {
  const { year, month, day, hour, minute, second } = displayDateParts(now);
  // Treat the zone's wall-clock reading of `now`, and the same calendar day's
  // 23:59:59.999, as if both were UTC. The difference between the first
  // fabricated instant and the real `now` IS the zone's current offset, so
  // subtracting it from the second converts it back to a real UTC instant —
  // without ever hardcoding +8.
  const nowAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const endAsUtc = Date.UTC(year, month - 1, day, 23, 59, 59, 999);
  const offset = nowAsUtc - now.getTime();
  return new Date(endAsUtc - offset);
}
