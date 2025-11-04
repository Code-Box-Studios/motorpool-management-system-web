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

export const DRIVER_STATUS = ['Active', 'Inactive'] as const;