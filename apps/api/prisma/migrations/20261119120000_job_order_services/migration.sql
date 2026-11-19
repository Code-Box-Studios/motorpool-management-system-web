-- Standard services picked on a job order (JOB_ORDER_SERVICES in @mms/shared).
-- incident_details keeps any additional services beyond the list.
ALTER TABLE "job_orders" ADD COLUMN     "services" TEXT[] DEFAULT ARRAY[]::TEXT[];
