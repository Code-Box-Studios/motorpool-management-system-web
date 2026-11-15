-- Unknown historical measurement times remain NULL. Legacy rows use their
-- original receipt time when choosing the latest position; no history is rewritten.
ALTER TABLE "gps_data" ADD COLUMN "fix_time" TIMESTAMP(3);

-- Supports deterministic latest-event selection, including legacy NULL times.
CREATE INDEX "gps_data_vehicle_event_time_idx" ON "gps_data" (
  "vehicle_id", COALESCE("fix_time", "created_at") DESC, "created_at" DESC, "gps_id" DESC
);
