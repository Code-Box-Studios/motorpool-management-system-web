-- These fields are edited as date-and-time values. DATE silently discarded
-- their time and could move early Philippine entries to the prior calendar day.
-- Preserve existing API instants (legacy dates were returned as UTC midnight).
-- Historical time-of-day information was already lost and is not invented here.
ALTER TABLE "job_orders"
  ALTER COLUMN "incident_date" TYPE TIMESTAMPTZ(3)
    USING "incident_date"::timestamp AT TIME ZONE 'UTC',
  ALTER COLUMN "date_of_request" TYPE TIMESTAMPTZ(3)
    USING "date_of_request"::timestamp AT TIME ZONE 'UTC',
  ALTER COLUMN "target_date" TYPE TIMESTAMPTZ(3)
    USING "target_date"::timestamp AT TIME ZONE 'UTC',
  ALTER COLUMN "actual_date_of_release" TYPE TIMESTAMPTZ(3)
    USING "actual_date_of_release"::timestamp AT TIME ZONE 'UTC';
