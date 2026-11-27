-- Job orders offer preventive and corrective maintenance as one choice.
-- Kept apart from the row update below: Postgres cannot use a new enum value
-- in the same transaction that adds it.
ALTER TYPE "MaintenanceType" ADD VALUE IF NOT EXISTS 'preventive_corrective' AFTER 'corrective';
