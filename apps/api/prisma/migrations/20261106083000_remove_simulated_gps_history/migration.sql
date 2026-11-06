BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Retain recovery copies outside the live GPS tables and application endpoints.
CREATE TABLE IF NOT EXISTS "gps_simulation_cleanup_backups" (
    "gps_id" UUID NOT NULL,
    "vehicle_id" UUID,
    "point" JSONB NOT NULL,
    "vehicle_location" JSONB,
    "backed_up_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gps_simulation_cleanup_backups_pkey" PRIMARY KEY ("gps_id")
);

CREATE INDEX IF NOT EXISTS "gps_simulation_cleanup_backups_vehicle_id_idx"
    ON "gps_simulation_cleanup_backups"("vehicle_id");

-- The first real ST-901L-X decoder started at 05:36:19 UTC on 6 November.
-- Match complete historical simulation fingerprints, never every older row.
CREATE TEMP TABLE "_mms_legacy_gps_candidates" ON COMMIT DROP AS
SELECT g.gps_id, g.vehicle_id, to_jsonb(g) AS point
FROM gps_data g
WHERE g.created_at < TIMESTAMP '2026-11-06 05:36:19'
  AND g.trip_id IS NULL
  AND g.engine_status = 'on'
  AND (
    EXISTS (
      SELECT 1
      FROM generate_series(0, 24) AS step(i)
      CROSS JOIN (VALUES (0), (1)) AS route(offset_number)
      WHERE g.created_at = TIMESTAMP '2026-07-01 08:00:00' + step.i * INTERVAL '1 minute'
        AND abs(g.latitude - (14.5995 + route.offset_number * 0.01 + step.i * 0.0005)) < 1e-9
        AND abs(g.longitude - (120.9842 + step.i * 0.0007)) < 1e-9
        AND g.speed = 30 + mod(step.i, 20)
        AND g.heading = 90
    )
    OR EXISTS (
      SELECT 1
      FROM (VALUES
        (7.0731, 125.6128, 44.781024213702324, true),
        (7.0745, 125.6142, 40.697664403575345, true),
        (7.0760, 125.6155, 36.659705466732590, true),
        (7.0780, 125.6170, 44.780664431183425, true),
        (7.0800, 125.6190, 44.780540198072345, true),
        (7.0820, 125.6210, 44.780323204500974, false),
        (7.0850, 125.6240, 44.780136695943210, false),
        (7.0880, 125.6270, 223.40387753418452, false)
      ) AS route(latitude, longitude, heading, tcp_simulator)
      WHERE abs(g.latitude - route.latitude) < 1e-9
        AND abs(g.longitude - route.longitude) < 1e-9
        AND (
          (g.speed >= 30 AND g.speed < 50 AND abs(g.heading - route.heading) < 1e-9)
          OR (route.tcp_simulator AND g.heading = 90 AND (abs(g.speed - 37.04) < 1e-9 OR g.speed = 20))
        )
    )
  );

-- Lock affected vehicles in a consistent order before rebuilding cached locations.
SELECT v.id FROM vehicles v
WHERE v.id IN (SELECT vehicle_id FROM "_mms_legacy_gps_candidates")
ORDER BY v.id FOR UPDATE OF v;

SELECT g.gps_id FROM gps_data g
JOIN "_mms_legacy_gps_candidates" c ON c.gps_id = g.gps_id
ORDER BY g.gps_id FOR UPDATE OF g;

-- Skip any GPS row changed since selection and never overwrite an older backup.
INSERT INTO "gps_simulation_cleanup_backups" (gps_id, vehicle_id, point, vehicle_location)
SELECT g.gps_id, g.vehicle_id, c.point,
  CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object(
    'id', v.id,
    'latitude', v.latitude,
    'longitude', v.longitude,
    'lastLocationUpdate', v.last_location_update
  ) END
FROM gps_data g
JOIN "_mms_legacy_gps_candidates" c ON c.gps_id = g.gps_id
LEFT JOIN vehicles v ON v.id = g.vehicle_id
WHERE to_jsonb(g) = c.point
ON CONFLICT (gps_id) DO NOTHING;

-- Delete only rows with an exact recovery snapshot already stored.
CREATE TEMP TABLE "_mms_cleaned_gps_vehicles" ON COMMIT DROP AS
WITH removed AS (
  DELETE FROM gps_data g
  USING "_mms_legacy_gps_candidates" c, "gps_simulation_cleanup_backups" b
  WHERE g.gps_id = c.gps_id
    AND b.gps_id = g.gps_id
    AND b.point = c.point
    AND to_jsonb(g) = c.point
  RETURNING g.vehicle_id
)
SELECT DISTINCT vehicle_id FROM removed WHERE vehicle_id IS NOT NULL;

UPDATE vehicles v
SET latitude = latest.latitude,
    longitude = latest.longitude,
    last_location_update = latest.created_at,
    updated_at = CURRENT_TIMESTAMP
FROM (
  SELECT cleaned.vehicle_id, point.latitude, point.longitude, point.created_at
  FROM "_mms_cleaned_gps_vehicles" cleaned
  LEFT JOIN LATERAL (
    SELECT g.latitude, g.longitude, g.created_at
    FROM gps_data g
    WHERE g.vehicle_id = cleaned.vehicle_id
    ORDER BY g.created_at DESC, g.gps_id DESC
    LIMIT 1
  ) point ON true
) latest
WHERE v.id = latest.vehicle_id;

COMMIT;
