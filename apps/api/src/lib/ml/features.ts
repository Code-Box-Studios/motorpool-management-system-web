// Ported verbatim from the FE (predictive-maintenance.ts extractFeatures /
// analytics.ts extractVehicleFeatures — byte-identical). `now` is injected so
// the computation is deterministic and testable (the FE used new Date()).
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
  const lastMaintMileage = lastMaint?.mileage ?? 0;
  const kmSinceLastMaint = Math.max(0, vehicle.mileage - lastMaintMileage);

  let avgDailyKm = 0;
  if (rows.length >= 2) {
    const newest = rows[0]!;
    const oldest = rows[rows.length - 1]!;
    const daysBetween = Math.max(1, (newest.date.getTime() - oldest.date.getTime()) / DAY_MS);
    const kmBetween = Math.abs((newest.mileage ?? 0) - (oldest.mileage ?? 0));
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
