import type { RiskAssessment } from '@mms/shared';
import { formatDisplayDate } from '../../lib/timezone.js';

const DEFAULT_INTERVAL_KM = 5000;
const DAY_MS = 86_400_000;
interface ServiceRow {
  date: Date;
  mileage: number | null;
  nextDue: Date | null;
}
interface TrackingRow {
  nextDueMileage: number | null;
  nextDueDate: Date | null;
  scheduleItem: { maintenanceStandardId: string };
}
const civilDay = (date: Date) => date.toISOString().slice(0, 10);

// DATE columns represent calendar days. Compare them with the Philippine
// calendar day, including the hours before midnight UTC has caught up.
export function preventiveStatus(
  vehicle: { mileage: number; maintenanceStandardId: string | null },
  services: ServiceRow[],
  tracking: TrackingRow[],
  now: Date
): Pick<
  RiskAssessment,
  | 'lastMaintenanceDate'
  | 'lastMaintenanceMileage'
  | 'nextMaintenanceDueMileage'
  | 'nextMaintenanceDueDate'
  | 'preventiveStatus'
  | 'preventiveSource'
> {
  const today = formatDisplayDate(now);
  const history = services
    .filter((row) => civilDay(row.date) <= today)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  const last = history[0];
  const baseline = history.find((row) => row.mileage !== null);
  const configured = tracking.filter(
    (row) =>
      vehicle.maintenanceStandardId !== null &&
      row.scheduleItem.maintenanceStandardId ===
        vehicle.maintenanceStandardId &&
      (row.nextDueMileage !== null || row.nextDueDate !== null)
  );
  const mileages = configured.flatMap((row) =>
    row.nextDueMileage === null ? [] : [row.nextDueMileage]
  );
  const days = configured
    .flatMap((row) =>
      row.nextDueDate === null ? [] : [civilDay(row.nextDueDate)]
    )
    .sort();
  const nextMaintenanceDueMileage = configured.length
    ? mileages.length
      ? Math.min(...mileages)
      : null
    : baseline
      ? baseline.mileage! + DEFAULT_INTERVAL_KM
      : null;
  const nextMaintenanceDueDate = configured.length
    ? (days[0] ?? null)
    : last?.nextDue
      ? civilDay(last.nextDue)
      : null;
  const known =
    nextMaintenanceDueMileage !== null || nextMaintenanceDueDate !== null;
  const soon = civilDay(
    new Date(Date.parse(today + 'T00:00:00Z') + 30 * DAY_MS)
  );
  const overdue =
    (nextMaintenanceDueMileage !== null &&
      vehicle.mileage >= nextMaintenanceDueMileage) ||
    (nextMaintenanceDueDate !== null && nextMaintenanceDueDate <= today);
  const dueSoon =
    (nextMaintenanceDueMileage !== null &&
      vehicle.mileage >= nextMaintenanceDueMileage - 500) ||
    (nextMaintenanceDueDate !== null && nextMaintenanceDueDate <= soon);
  return {
    lastMaintenanceDate: last ? civilDay(last.date) : null,
    lastMaintenanceMileage: baseline?.mileage ?? null,
    nextMaintenanceDueMileage,
    nextMaintenanceDueDate,
    preventiveStatus: !known
      ? 'unknown'
      : overdue
        ? 'overdue'
        : dueSoon
          ? 'due_soon'
          : 'on_schedule',
    preventiveSource: configured.length
      ? 'configured_schedule'
      : known
        ? 'service_history'
        : 'unknown'
  };
}
