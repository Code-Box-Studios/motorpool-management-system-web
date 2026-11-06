-- Packet history remains independent of device registration and vehicle deletion.
CREATE TABLE "tracker_packet_logs" (
  "id" UUID PRIMARY KEY,
  "revision" SMALLINT NOT NULL,
  "received_at" TIMESTAMPTZ(3) NOT NULL,
  "stored_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "connection_id" UUID NOT NULL,
  "peer" VARCHAR(256) NOT NULL,
  "device_id" VARCHAR(128),
  "vehicle_id" UUID,
  "message_type" VARCHAR(32),
  "kind" VARCHAR(32) NOT NULL,
  "outcome" VARCHAR(32) NOT NULL,
  "raw_hex" VARCHAR(16384) NOT NULL,
  "fix_time" TIMESTAMPTZ(3),
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "speed" DOUBLE PRECISION,
  "heading" DOUBLE PRECISION,
  "ignition" BOOLEAN,
  "reason" VARCHAR(2000),
  CONSTRAINT "tracker_packet_logs_revision_check" CHECK (
    ("revision" = 0 AND "outcome" = 'received') OR
    ("revision" = 1 AND "outcome" <> 'received')
  ),
  CONSTRAINT "tracker_packet_logs_kind_check" CHECK (
    "kind" IN ('position', 'heartbeat', 'unknown', 'fragment', 'socket_error')
  ),
  CONSTRAINT "tracker_packet_logs_outcome_check" CHECK (
    "outcome" IN ('received', 'saved', 'heartbeat', 'invalid_fix', 'device_unavailable',
      'unsupported', 'incomplete', 'oversized', 'resolution_error', 'forward_error', 'socket_error')
  ),
  CONSTRAINT "tracker_packet_logs_raw_hex_check" CHECK ("raw_hex" ~ '^([0-9a-fA-F]{2})*$')
);

CREATE INDEX "tracker_packet_logs_received_at_id_idx"
  ON "tracker_packet_logs" ("received_at" DESC, "id" DESC);
CREATE INDEX "tracker_packet_logs_device_id_received_at_id_idx"
  ON "tracker_packet_logs" ("device_id", "received_at" DESC, "id" DESC);
