// Formatting and tone rules shared by the maintenance cards. They live outside
// the component module so a Fast Refresh boundary isn't broken by exporting
// plain functions alongside components.

export type MaintenancePriority = 'high' | 'medium' | 'low';
export type MaintenanceTone = 'stop' | 'wait' | 'done' | 'neutral';

/**
 * A vehicle that has never been serviced has no service date at all, and
 * `new Date(null)`, `new Date('')` and `new Date('N/A')` all stringify to
 * "Invalid Date". Every date the cards print goes through here so that string
 * cannot reach the screen.
 */
export const formatMaintenanceDate = (
  value: string | null | undefined,
  fallback = '—'
): string => {
  if (!value) return fallback;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? fallback
    : parsed.toLocaleDateString();
};

/**
 * Sort key for "oldest service first". A vehicle with no history sorts as the
 * oldest of all — it is the most overdue, not the least.
 */
export const lastServiceTime = (value: string | null | undefined): number => {
  if (!value) return 0;

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

export const METER_TONE: Record<MaintenanceTone, string> = {
  stop: 'bg-status-stop-fg',
  wait: 'bg-status-wait-fg',
  done: 'bg-status-done-fg',
  neutral: 'bg-status-neut-fg'
};

export const PRIORITY: Record<
  MaintenancePriority,
  {
    badge: 'stop' | 'wait' | 'neutral';
    tone: MaintenanceTone;
    priorityLabel: string;
    riskLabel: string;
  }
> = {
  high: {
    badge: 'stop',
    tone: 'stop',
    priorityLabel: 'High Priority',
    riskLabel: 'High Risk'
  },
  medium: {
    badge: 'wait',
    tone: 'wait',
    priorityLabel: 'Medium Priority',
    riskLabel: 'Medium Risk'
  },
  low: {
    badge: 'neutral',
    tone: 'done',
    priorityLabel: 'Low Priority',
    riskLabel: 'Low Risk'
  }
};

/** Tone a 0-100 meter by how bad it is, so every bar in the app reads alike. */
export const meterTone = (percent: number): MaintenanceTone => {
  if (percent >= 100) return 'stop';
  if (percent >= 80) return 'wait';
  return 'done';
};

/** The bar tone behind a priority, so a risk meter can never disagree with the
 *  risk badge sitting above it. */
export const priorityMeterTone = (
  priority: MaintenancePriority
): MaintenanceTone => PRIORITY[priority].tone;
