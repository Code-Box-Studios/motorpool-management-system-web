import { prisma } from '../../lib/prisma.js';

export async function vehicleStatusCounts() {
  const groups = await prisma.vehicle.groupBy({
    by: ['status'],
    _count: { _all: true }
  });
  const total = await prisma.vehicle.count();
  return { groups, total };
}

export function completedTripsCount() {
  return prisma.tripTicket.count({ where: { status: 'completed' } });
}

export function vehiclesWithMaintenance() {
  return prisma.vehicle.findMany({
    include: { maintenances: { orderBy: { date: 'desc' } } }
  });
}

// Job orders that used spare parts, with the join rows + the vehicle (for the
// optional vehicleType filter).
export function jobOrdersWithSpareParts() {
  return prisma.jobOrder.findMany({
    where: { spareParts: { some: {} } },
    include: { spareParts: true, vehicle: { select: { make: true } } }
  });
}

export function allSpareParts() {
  return prisma.sparePart.findMany({ select: { id: true, name: true } });
}

interface DowntimeHoursRow {
  vehicle_id: string;
  downtime_hours: number;
}

// Total hours each vehicle has spent `under_maintenance`, from the status
// audit trail (client-dt-brief.md §2). `vehicle_status_audit.created_at` is
// the only TIMESTAMP(3) — hour-precision — column touching status; every
// job_orders date column is a Postgres DATE (day precision), so it cannot be
// used here. Prisma's query builder has no window functions, hence the raw
// query.
//
// A span opens on the row where `new_status = 'under_maintenance'` and
// closes at that SAME VEHICLE's next audit row (LEAD() over vehicle_id
// ordered by created_at). Direction is read from `new_status`, deliberately
// NEVER from `change_source`: job-order deletion (job-orders/service.ts)
// closes a span with `change_source: 'job_order_note'` — the exact same
// source the OPEN also carries (job-orders/transitions.ts's `note`) — so
// branching on source would misread that close as another open.
//
// A span with no following row (the vehicle is CURRENTLY under_maintenance)
// is still open and is charged up to `now`. That is correct for live
// inference — the vehicle IS still down — though it will overcount if the
// vehicle quietly went back into service without an audit row.
//
// KNOWN UNDERCOUNT, not fixed here: two job orders can hold one vehicle at
// once, and the first `completeRepair` closes the span early, so time spent
// down under the second, still-open job order goes uncounted.
//
// A vehicle with zero audit rows is simply absent from the returned map —
// the caller (service.ts, via features.ts) treats that as 0, never null.
export async function downtimeHoursByVehicle(
  now: Date
): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<DowntimeHoursRow[]>`
    WITH spans AS (
      SELECT
        vehicle_id,
        new_status,
        created_at,
        LEAD(created_at) OVER (
          PARTITION BY vehicle_id ORDER BY created_at
        ) AS next_created_at
      FROM vehicle_status_audit
    )
    SELECT
      vehicle_id,
      SUM(
        EXTRACT(
          EPOCH FROM (
            COALESCE(next_created_at, ${now.toISOString()}::timestamp) - created_at
          )
        ) / 3600.0
      ) AS downtime_hours
    FROM spans
    WHERE new_status = 'under_maintenance'
    GROUP BY vehicle_id
  `;
  return new Map(rows.map((r) => [r.vehicle_id, Number(r.downtime_hours)]));
}
