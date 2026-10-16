import { STATUS_LABELS } from '@mms/shared';

// The single source of truth for what a status *means*. The raw enum names
// ("pending_fuel_allocation_approval") belong to the database; people get
// "Awaiting fuel", and every surface — badges, calendars — derives its colour
// from the same five semantic tones.
export type StatusTone = 'wait' | 'move' | 'done' | 'stop' | 'neutral';

export interface StatusMeta {
  tone: StatusTone;
  label: string;
}

const STATUS_TONES: Record<string, StatusTone> = {
  // --- Trip tickets ---
  pending_admin_approval: 'wait',
  pending_fuel_allocation_approval: 'wait',
  approved: 'neutral',
  in_progress: 'move',
  completed: 'done',
  cancelled: 'stop',
  disapproved: 'stop',

  // --- Trip dates (one outing's own status, distinct from its ticket's) ---
  scheduled: 'neutral',

  // --- Job orders ---
  pending: 'wait',
  assigned_mechanic: 'wait',
  ongoing_repair: 'move',
  repaired: 'done',

  // --- Vehicles ---
  available: 'done',
  on_trip: 'move',
  in_use: 'move',
  under_maintenance: 'wait',
  maintenance: 'wait',
  out_of_service: 'stop',
  unavailable: 'neutral',
  not_available: 'neutral',
  to_be_repaired: 'wait',

  // --- Tools ---
  borrowed: 'neutral',

  // --- Drivers / trackers / accounts ---
  active: 'done',
  inactive: 'neutral',
  decommissioned: 'stop',

  // --- Maintenance tracking ---
  due_soon: 'wait',
  overdue: 'stop'
};

// An unknown status still renders sensibly: title-cased, neutral tone.
export function resolveStatus(status: string): StatusMeta {
  const key = status.toLowerCase();
  const tone = STATUS_TONES[key];
  if (tone) return { tone, label: STATUS_LABELS[key] };
  return {
    tone: 'neutral',
    label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  };
}

const TONE_BACKGROUND: Record<StatusTone, string> = {
  wait: 'var(--status-wait-bg)',
  move: 'var(--status-move-bg)',
  done: 'var(--status-done-bg)',
  stop: 'var(--status-stop-bg)',
  neutral: 'var(--status-neut-bg)'
};

// Calendar chips used to hardcode saturated web colours (#3b82f6, #f59e0b),
// which belonged to no palette and clashed with everything around them. They
// now read from the same tones as the badges.
export function statusEventColor(status: string): string {
  return TONE_BACKGROUND[resolveStatus(status).tone];
}

// Maintenance rows are typed by the work done, not by a status, so they get
// their own mapping onto the same tones.
const MAINTENANCE_TYPE_TONE: Record<string, StatusTone> = {
  preventive: 'wait',
  inspection: 'neutral',
  service: 'done',
  repair: 'move',
  corrective: 'stop'
};

export function maintenanceEventColor(type: string): string {
  const tone = MAINTENANCE_TYPE_TONE[type?.toLowerCase()] ?? 'neutral';
  return TONE_BACKGROUND[tone];
}
