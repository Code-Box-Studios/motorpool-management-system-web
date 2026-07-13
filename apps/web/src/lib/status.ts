// The single source of truth for what a status *means*. The raw enum names
// ("pending_fuel_allocation_approval") belong to the database; people get
// "Awaiting fuel", and every surface — badges, calendars — derives its colour
// from the same five semantic tones.
export type StatusTone = 'wait' | 'move' | 'done' | 'stop' | 'neutral';

export interface StatusMeta {
  tone: StatusTone;
  label: string;
}

const STATUS_MAP: Record<string, StatusMeta> = {
  // --- Trip tickets ---
  pending_admin_approval: { tone: 'wait', label: 'Needs approval' },
  pending_fuel_allocation_approval: { tone: 'wait', label: 'Awaiting fuel' },
  approved: { tone: 'neutral', label: 'Approved' },
  in_progress: { tone: 'move', label: 'On the road' },
  completed: { tone: 'done', label: 'Completed' },
  cancelled: { tone: 'stop', label: 'Cancelled' },
  disapproved: { tone: 'stop', label: 'Declined' },

  // --- Job orders ---
  pending: { tone: 'wait', label: 'Pending' },
  assigned_mechanic: { tone: 'wait', label: 'Awaiting sign-off' },
  ongoing_repair: { tone: 'move', label: 'In repair' },
  repaired: { tone: 'done', label: 'Repaired' },

  // --- Vehicles ---
  available: { tone: 'done', label: 'Ready' },
  on_trip: { tone: 'move', label: 'On the road' },
  in_use: { tone: 'move', label: 'On the road' },
  under_maintenance: { tone: 'wait', label: 'In the shop' },
  maintenance: { tone: 'wait', label: 'In the shop' },
  out_of_service: { tone: 'stop', label: 'Out of service' },
  unavailable: { tone: 'neutral', label: 'Unavailable' },
  not_available: { tone: 'neutral', label: 'Unavailable' },
  to_be_repaired: { tone: 'wait', label: 'Needs repair' },

  // --- Tools ---
  borrowed: { tone: 'neutral', label: 'Borrowed' },

  // --- Drivers / trackers / accounts ---
  active: { tone: 'done', label: 'Active' },
  inactive: { tone: 'neutral', label: 'Inactive' },
  decommissioned: { tone: 'stop', label: 'Decommissioned' },

  // --- Maintenance tracking ---
  due_soon: { tone: 'wait', label: 'Due soon' },
  overdue: { tone: 'stop', label: 'Overdue' }
};

// An unknown status still renders sensibly: title-cased, neutral tone.
export function resolveStatus(status: string): StatusMeta {
  const key = status.toLowerCase();
  const known = STATUS_MAP[key];
  if (known) return known;
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
