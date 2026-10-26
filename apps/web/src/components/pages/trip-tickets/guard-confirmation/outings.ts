type Outing = { status: string; start_ts: string; end_ts: string };

/** Mirror the gate API's actual outing selection, including Manila's calendar day. */
export function gateOuting<T extends Outing>(
  status: string,
  dates: T[],
  now = new Date()
): T | undefined {
  if (status === 'in_progress')
    return dates.find((date) => date.status === 'in_progress');
  if (status !== 'approved') return undefined;
  const dayMs = 86400000;
  const manilaOffsetMs = 8 * 3600000;
  const endOfManilaDay =
    Math.floor((now.getTime() + manilaOffsetMs) / dayMs) * dayMs +
    dayMs -
    manilaOffsetMs -
    1;
  return dates
    .filter(
      (date) =>
        date.status === 'scheduled' &&
        new Date(date.end_ts) > now &&
        new Date(date.start_ts).getTime() <= endOfManilaDay
    )
    .sort(
      (a, b) => new Date(a.start_ts).getTime() - new Date(b.start_ts).getTime()
    )[0];
}
