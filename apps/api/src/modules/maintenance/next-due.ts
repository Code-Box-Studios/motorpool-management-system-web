// Ported verbatim from the FE's completeMaintenanceTask / computeTrackingStatus
// (feat/standard-maintenance). interval_type is intentionally NOT consulted —
// each output derives purely from the truthiness of its interval.

// Adds whole calendar months using JS Date.setMonth (preserving the FE's
// overflow behavior, e.g. Jan 31 + 1 month -> Mar 3).
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function computeNextDue(
  anchorDate: Date,
  anchorMileage: number,
  intervalMonths: number | null,
  intervalMileage: number | null
): { nextDueDate: Date | null; nextDueMileage: number | null } {
  return {
    nextDueDate: intervalMonths ? addMonths(anchorDate, intervalMonths) : null,
    nextDueMileage: intervalMileage ? anchorMileage + intervalMileage : null
  };
}

interface TrackingLike {
  status: string | null;
  nextDueDate: Date | null;
  nextDueMileage: number | null;
}

// Derives the display status. Only 'pending'/'completed' are ever persisted;
// 'overdue'/'due_soon' are computed here on read (spec §6). Thresholds:
// overdue = past due date OR mileage >= next; due_soon = within 30 days OR
// within 500 km (checked only for already-completed rows).
export function deriveTrackingStatus(
  t: TrackingLike,
  now: Date,
  currentMileage: number
): 'overdue' | 'due_soon' | 'pending' | 'completed' {
  const dateOverdue = t.nextDueDate !== null && t.nextDueDate <= now;
  const mileageOverdue =
    t.nextDueMileage !== null && currentMileage >= t.nextDueMileage;

  if (t.status === 'completed') {
    if (dateOverdue || mileageOverdue) return 'overdue';
    const soonDate = new Date(now);
    soonDate.setDate(soonDate.getDate() + 30);
    const dateSoon = t.nextDueDate !== null && t.nextDueDate <= soonDate;
    const mileageSoon =
      t.nextDueMileage !== null && currentMileage >= t.nextDueMileage - 500;
    if (dateSoon || mileageSoon) return 'due_soon';
    return 'completed';
  }

  // Never completed: pending unless a due threshold is already passed.
  if (t.nextDueDate !== null || t.nextDueMileage !== null) {
    if (dateOverdue || mileageOverdue) return 'overdue';
  }
  return 'pending';
}
