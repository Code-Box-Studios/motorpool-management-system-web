-- Fold job orders recorded under the old separate choices into the merged one.
-- Maintenance history rows keep their original type.
UPDATE "job_orders"
SET "maintenance_type" = 'preventive_corrective'
WHERE "maintenance_type" IN ('preventive', 'corrective');
