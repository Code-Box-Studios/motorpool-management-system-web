-- At most one ACTIVE tracker may be assigned to a given vehicle.
-- Partial + NULL-guarded so multiple inactive/decommissioned rows, and multiple
-- unassigned (vehicle_id IS NULL) active spares, are still allowed.
CREATE UNIQUE INDEX "tracker_devices_active_vehicle_unique"
  ON "tracker_devices" ("vehicle_id")
  WHERE "status" = 'active' AND "vehicle_id" IS NOT NULL;
