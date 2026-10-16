BEGIN;

-- Preserve every historical employee assignment while supporting user guides.
ALTER TABLE "trip_ticket_employees"
  ADD COLUMN "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN "user_id" UUID;
ALTER TABLE "trip_ticket_employees" DROP CONSTRAINT "trip_ticket_employees_pkey";
ALTER TABLE "trip_ticket_employees" ALTER COLUMN "employee_id" DROP NOT NULL;
ALTER TABLE "trip_ticket_employees" ADD CONSTRAINT "trip_ticket_employees_pkey" PRIMARY KEY ("id");
ALTER TABLE "trip_ticket_employees" ALTER COLUMN "id" DROP DEFAULT;
CREATE UNIQUE INDEX "trip_ticket_employees_trip_ticket_id_employee_id_key"
  ON "trip_ticket_employees"("trip_ticket_id", "employee_id");
CREATE UNIQUE INDEX "trip_ticket_employees_trip_ticket_id_user_id_key"
  ON "trip_ticket_employees"("trip_ticket_id", "user_id");
CREATE INDEX "trip_ticket_employees_user_id_idx" ON "trip_ticket_employees"("user_id");
ALTER TABLE "trip_ticket_employees"
  ADD CONSTRAINT "trip_ticket_employees_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "trip_ticket_employees_one_identity_check"
  CHECK (("employee_id" IS NOT NULL)::int + ("user_id" IS NOT NULL)::int = 1);

ALTER TABLE "trip_tickets"
  ADD COLUMN "destination_latitude" DOUBLE PRECISION,
  ADD COLUMN "destination_longitude" DOUBLE PRECISION,
  ADD CONSTRAINT "trip_tickets_destination_coordinates_check" CHECK (
    ("destination_latitude" IS NULL AND "destination_longitude" IS NULL)
    OR ("destination_latitude" IS NOT NULL AND "destination_longitude" IS NOT NULL
      AND "destination_latitude" BETWEEN -90 AND 90
      AND "destination_longitude" BETWEEN -180 AND 180)
  );

COMMIT;
