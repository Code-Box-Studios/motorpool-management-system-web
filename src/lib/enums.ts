export const VEHICLE_STATUS = {
  AVAILABLE: 'available',
  ON_TRIP: 'on_trip',
  OUT_OF_SERVICE: 'out_of_service',
  TO_BE_REPAIRED: 'to_be_repaired',
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
  PENDING: 'pending',
  APPROVED: 'approved',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
} as const;

export const JOB_ORDER_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
} as const;

export const MAINTENANCE_TYPE = {
  PREVENTIVE: 'preventive',
  CORRECTIVE: 'corrective',
  INSPECTION: 'inspection',
  REPAIR: 'repair',
  SERVICE: 'service'
} as const;