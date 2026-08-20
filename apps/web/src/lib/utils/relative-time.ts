// "3 minutes ago" answers the question people actually ask of a timestamp; the
// exact instant belongs underneath it, for the ones who need to correlate logs.
//
// Lived inside the tracker-device screen until the notification bell needed the
// same thing — one copy, so two screens can never drift on how they say "now".
const RELATIVE_STEPS: { limit: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { limit: 60, unit: 'second' },
  { limit: 60, unit: 'minute' },
  { limit: 24, unit: 'hour' },
  { limit: 7, unit: 'day' },
  { limit: 4.34524, unit: 'week' },
  { limit: 12, unit: 'month' },
  { limit: Number.POSITIVE_INFINITY, unit: 'year' }
];

export const relativeTime = (from: Date): string => {
  const formatter = new Intl.RelativeTimeFormat(undefined, {
    numeric: 'auto'
  });
  let elapsed = (from.getTime() - Date.now()) / 1000;
  for (const step of RELATIVE_STEPS) {
    if (Math.abs(elapsed) < step.limit) {
      return formatter.format(Math.round(elapsed), step.unit);
    }
    elapsed /= step.limit;
  }
  return formatter.format(Math.round(elapsed), 'year');
};
