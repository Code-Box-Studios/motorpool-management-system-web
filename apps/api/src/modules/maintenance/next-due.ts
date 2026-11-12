// Interval arithmetic preserves the original maintenance workflow.
// interval_type is intentionally not consulted; each output derives from its
// interval. Date-only status checks use the Philippine calendar day.
import { formatDisplayDate } from '../../lib/timezone.js';

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
  const today = formatDisplayDate(now);
  const dueDay = t.nextDueDate?.toISOString().slice(0, 10) ?? null;
  const dateOverdue = dueDay !== null && dueDay <= today;
  const mileageOverdue =
    t.nextDueMileage !== null && currentMileage >= t.nextDueMileage;

  if (t.status === 'completed') {
    if (dateOverdue || mileageOverdue) return 'overdue';
    const soonDate = new Date(`${today}T00:00:00Z`);
    soonDate.setUTCDate(soonDate.getUTCDate() + 30);
    const dateSoon =
      dueDay !== null && dueDay <= soonDate.toISOString().slice(0, 10);
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
