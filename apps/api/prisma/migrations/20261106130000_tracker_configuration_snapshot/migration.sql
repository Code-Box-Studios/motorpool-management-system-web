-- Existing tracker records intentionally have no configuration until an RCONF
-- reply is imported. The JSON envelope stores only allowlisted settings and
-- a server-generated recordedAt timestamp; raw replies are never stored.
ALTER TABLE "tracker_devices" ADD COLUMN "configuration" JSONB;
