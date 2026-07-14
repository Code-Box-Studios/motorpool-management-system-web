// `now` is injected so the computation is deterministic and testable.
const DAY_MS = 1000 * 60 * 60 * 24;

interface MaintenanceRow {
  date: Date;
  mileage: number | null;
}

export function extractFeatures(
  vehicle: { mileage: number },
  maintenances: MaintenanceRow[],
  now: Date
): { kmSinceLastMaint: number; avgDailyKm: number; maintFreq12m: number } {
  // Newest first.
  const rows = [...maintenances].sort((a, b) => b.date.getTime() - a.date.getTime());
  const lastMaint = rows[0];

  // The baseline is the newest service whose ODOMETER we actually know — not
  // simply the newest service. This used to be `lastMaint?.mileage ?? 0`, which
  // read a service with no recorded mileage as a service at 0 km, making
  // "distance since last service" the vehicle's entire odometer. A repair
  // completed through the job-order flow wrote exactly such a row, so fixing a
  // van was what made it look like it was about to break.
  const withOdometer = rows.filter((row) => row.mileage !== null);
  const baseline = withOdometer[0];

  let kmSinceLastMaint: number;
  if (baseline) {
    kmSinceLastMaint = Math.max(0, vehicle.mileage - baseline.mileage!);
  } else if (lastMaint) {
    // It HAS been serviced; we just don't know at what odometer. Unknown is not
    // the same as never, so don't charge it the whole odometer.
    kmSinceLastMaint = 0;
  } else {
    // Never serviced: every kilometre on the clock is distance since service.
    kmSinceLastMaint = vehicle.mileage;
  }

  let avgDailyKm = 0;
  if (withOdometer.length >= 2) {
    const newest = withOdometer[0]!;
    const oldest = withOdometer[withOdometer.length - 1]!;
    const daysBetween = Math.max(1, (newest.date.getTime() - oldest.date.getTime()) / DAY_MS);
    const kmBetween = Math.abs(newest.mileage! - oldest.mileage!);
    avgDailyKm = kmBetween / daysBetween;
  } else if (lastMaint) {
    const daysSinceLast = Math.max(1, (now.getTime() - lastMaint.date.getTime()) / DAY_MS);
    avgDailyKm = kmSinceLastMaint / daysSinceLast;
  }

  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const maintFreq12m = rows.filter((m) => m.date >= oneYearAgo).length;

  return { kmSinceLastMaint, avgDailyKm, maintFreq12m };
}
