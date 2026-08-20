-- CreateEnum
CREATE TYPE "TripDateStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "trip_dates" (
    "id" UUID NOT NULL,
    "trip_ticket_id" UUID NOT NULL,
    "start_ts" TIMESTAMP(3) NOT NULL,
    "end_ts" TIMESTAMP(3) NOT NULL,
    "status" "TripDateStatus" NOT NULL DEFAULT 'scheduled',
    "start_mileage" INTEGER,
    "end_mileage" INTEGER,
    "pre_trip_guard" UUID,
    "pre_trip_checked_by" UUID,
    "pre_trip_checked_at" TIMESTAMP(3),
    "post_trip_guard" UUID,
    "post_trip_checked_by" UUID,
    "post_trip_checked_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_dates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_dates_trip_ticket_id_idx" ON "trip_dates"("trip_ticket_id");

-- CreateIndex
CREATE INDEX "trip_dates_start_ts_end_ts_idx" ON "trip_dates"("start_ts", "end_ts");

-- AddForeignKey
ALTER TABLE "trip_dates" ADD CONSTRAINT "trip_dates_trip_ticket_id_fkey" FOREIGN KEY ("trip_ticket_id") REFERENCES "trip_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one date row per existing ticket, carrying its window, odometer and
-- guard stamps. Idempotent (NOT EXISTS), so a re-run is a no-op. Tickets with no
-- window get no row; Task 3 only requires dates on NEW and EDITED tickets.
INSERT INTO "trip_dates" (
  "id", "trip_ticket_id", "start_ts", "end_ts", "status",
  "start_mileage", "end_mileage",
  "pre_trip_guard", "pre_trip_checked_by", "pre_trip_checked_at",
  "post_trip_guard", "post_trip_checked_by", "post_trip_checked_at",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), t."id", t."start_ts", t."end_ts",
  CASE t."status"
    WHEN 'in_progress'  THEN 'in_progress'::"TripDateStatus"
    WHEN 'completed'    THEN 'completed'::"TripDateStatus"
    WHEN 'cancelled'    THEN 'cancelled'::"TripDateStatus"
    WHEN 'disapproved'  THEN 'cancelled'::"TripDateStatus"
    ELSE 'scheduled'::"TripDateStatus"
  END,
  t."start_mileage", t."end_mileage",
  t."pre_trip_guard", t."pre_trip_checked_by", t."pre_trip_checked_at",
  t."post_trip_guard", t."post_trip_checked_by", t."post_trip_checked_at",
  NOW(), NOW()
FROM "trip_tickets" t
WHERE t."start_ts" IS NOT NULL
  AND t."end_ts" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "trip_dates" d WHERE d."trip_ticket_id" = t."id"
  );
