-- Historical readings intentionally retain unknown recorder attribution.
ALTER TABLE "trip_dates"
  ADD COLUMN "start_mileage_recorded_by_id" UUID,
  ADD COLUMN "start_mileage_recorded_at" TIMESTAMP(3),
  ADD COLUMN "end_mileage_recorded_by_id" UUID,
  ADD COLUMN "end_mileage_recorded_at" TIMESTAMP(3);

CREATE TYPE "ServiceLocation" AS ENUM ('motorpool', 'outside');
ALTER TABLE "job_orders"
  ADD COLUMN "maintenance_type" "MaintenanceType",
  ADD COLUMN "service_location" "ServiceLocation";
