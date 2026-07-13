import { Badge } from '@/components/ui/badge';

export type StatusBadgeProps = {
  status: string;
  className?: string;
};

type StatusTone = 'wait' | 'move' | 'done' | 'stop' | 'neutral';

interface StatusMeta {
  tone: StatusTone;
  label: string;
}

// Every status the product can render, resolved to one of the five semantic
// tones plus a short human label. The raw enum names ("pending_fuel_allocation_
// approval") belong to the database; people get "Awaiting fuel".
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
function resolveStatus(status: string): StatusMeta {
  const key = status.toLowerCase();
  const known = STATUS_MAP[key];
  if (known) return known;
  return {
    tone: 'neutral',
    label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  };
}

const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const { tone, label } = resolveStatus(status);
  return (
    <Badge variant={tone} className={className}>
      {label}
    </Badge>
  );
};

export default StatusBadge;
