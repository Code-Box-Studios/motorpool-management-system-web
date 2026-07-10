export const USER_ROLES = {
  admin: 'admin',
  security_guard: 'security_guard',
  evp_operations: 'evp_operations',
  driver: 'driver',
  requester: 'requester'
} as const;

export const VEHICLE_STATUS = {
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
  ON_TRIP: 'on_trip',
  OUT_OF_SERVICE: 'out_of_service',
  UNDER_MAINTENANCE: 'under_maintenance'
} as const;

export const FUEL_TYPE = {
  GASOLINE: 'gasoline',
  DIESEL: 'diesel',
  ELECTRIC: 'electric',
  HYBRID: 'hybrid',
  OTHER: 'other'
} as const;

export const DRIVER_STATUS = ['Active', 'Inactive', 'On Trip'] as const;

export const TOOL_STATUS = {
  AVAILABLE: 'available',
  BORROWED: 'borrowed',
  UNDER_MAINTENANCE: 'under_maintenance',
  OUT_OF_SERVICE: 'out_of_service'
} as const;

export const TRIP_TICKET_STATUS = {
  PENDING_ADMIN_APPROVAL: 'pending_admin_approval',
  PENDING_FUEL_ALLOCATION_APPROVAL: 'pending_fuel_allocation_approval',
  CANCELLED: 'cancelled',
  DISAPPROVED: 'disapproved',
  APPROVED: 'approved',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed'
} as const;

export const JOB_ORDER_STATUS = {
  PENDING: 'pending',
  ASSIGNED_MECHANIC: 'assigned_mechanic',
  ONGOING_REPAIR: 'ongoing_repair',
  REPAIRED: 'repaired'
} as const;

export const REPAIR_DONE_TYPE = {
  SIMPLE: 'simple',
  COMPLEX: 'complex',
  COMPOUND: 'compound'
} as const;

export const MAINTENANCE_TYPE = {
  PREVENTIVE: 'preventive',
  CORRECTIVE: 'corrective',
  INSPECTION: 'inspection',
  REPAIR: 'repair',
  SERVICE: 'service'
} as const;

// Canonical driver status values for the new DB (snake_case), with the
// display strings the current UI renders.
export const DRIVER_STATUS_DB = ['active', 'inactive', 'on_trip'] as const;

export const DRIVER_STATUS_DISPLAY: Record<
  (typeof DRIVER_STATUS_DB)[number],
  string
> = {
  active: 'Active',
  inactive: 'Inactive',
  on_trip: 'On Trip'
};

// Schedule-item interval kind. Descriptive/UI-only — the next-due computation
// branches on the truthiness of interval_mileage / interval_months, NOT on this
// (faithful to the FE's real behavior). See modules/maintenance/next-due.ts.
export const INTERVAL_TYPE = {
  MILEAGE: 'mileage',
  TIME: 'time',
  BOTH: 'both'
} as const;

// Maintenance-tracking display status. Only 'pending' and 'completed' are ever
// persisted; 'due_soon' and 'overdue' are DERIVED on read (spec §6, ported from
// the FE's computeTrackingStatus).
export const TRACKING_STATUS = {
  PENDING: 'pending',
  DUE_SOON: 'due_soon',
  OVERDUE: 'overdue',
  COMPLETED: 'completed'
} as const;

// Tracker device lifecycle. Only `active` devices resolve to a vehicle for ingest.
export const TRACKER_DEVICE_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  DECOMMISSIONED: 'decommissioned'
} as const;
