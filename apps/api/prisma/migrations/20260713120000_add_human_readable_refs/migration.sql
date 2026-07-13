-- Trip tickets and job orders get a short number people can quote ("TT-2050",
-- "JO-118"). The uuid stays the primary key; this is purely the human handle.
--
-- Plain `ADD COLUMN ... SERIAL` would number existing rows in physical table
-- order, which is arbitrary. We number them by creation date instead, so the
-- oldest ticket is TT-1, then hand the column to a sequence. The end state is
-- identical to SERIAL: same sequence name, same default, same ownership.

-- AlterTable
ALTER TABLE "job_orders" ADD COLUMN "order_no" INTEGER;
ALTER TABLE "trip_tickets" ADD COLUMN "ticket_no" INTEGER;

-- Backfill existing rows in creation order
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at", "id") AS n
  FROM "job_orders"
)
UPDATE "job_orders" o
SET "order_no" = numbered.n
FROM numbered
WHERE o."id" = numbered."id";

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at", "id") AS n
  FROM "trip_tickets"
)
UPDATE "trip_tickets" t
SET "ticket_no" = numbered.n
FROM numbered
WHERE t."id" = numbered."id";

-- Hand new rows to a sequence, continuing after the highest backfilled number
CREATE SEQUENCE "job_orders_order_no_seq" OWNED BY "job_orders"."order_no";
SELECT setval(
  'job_orders_order_no_seq',
  COALESCE((SELECT MAX("order_no") FROM "job_orders"), 0) + 1,
  false
);
ALTER TABLE "job_orders"
  ALTER COLUMN "order_no" SET DEFAULT nextval('job_orders_order_no_seq'),
  ALTER COLUMN "order_no" SET NOT NULL;

CREATE SEQUENCE "trip_tickets_ticket_no_seq" OWNED BY "trip_tickets"."ticket_no";
SELECT setval(
  'trip_tickets_ticket_no_seq',
  COALESCE((SELECT MAX("ticket_no") FROM "trip_tickets"), 0) + 1,
  false
);
ALTER TABLE "trip_tickets"
  ALTER COLUMN "ticket_no" SET DEFAULT nextval('trip_tickets_ticket_no_seq'),
  ALTER COLUMN "ticket_no" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "job_orders_order_no_key" ON "job_orders"("order_no");
CREATE UNIQUE INDEX "trip_tickets_ticket_no_key" ON "trip_tickets"("ticket_no");
