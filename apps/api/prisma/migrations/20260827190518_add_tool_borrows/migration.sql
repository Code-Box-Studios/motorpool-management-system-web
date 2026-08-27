-- CreateTable
CREATE TABLE "tool_borrows" (
    "id" UUID NOT NULL,
    "tool_id" UUID NOT NULL,
    "borrower_id" UUID NOT NULL,
    "borrowed_at" TIMESTAMP(3) NOT NULL,
    "due_at" DATE,
    "returned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tool_borrows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tool_borrows_tool_id_borrowed_at_idx" ON "tool_borrows"("tool_id", "borrowed_at");

-- CreateIndex
CREATE INDEX "tool_borrows_returned_at_idx" ON "tool_borrows"("returned_at");

-- AddForeignKey
ALTER TABLE "tool_borrows" ADD CONSTRAINT "tool_borrows_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "tools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_borrows" ADD CONSTRAINT "tool_borrows_borrower_id_fkey" FOREIGN KEY ("borrower_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every tool currently signed out gets an OPEN borrow row.
--
-- Without this, a tool that is out right now has no opening row, so its
-- eventual return closes nothing and "tools out" derived from history disagrees
-- with the tools table permanently — with nothing on screen to indicate it.
INSERT INTO "tool_borrows" ("id", "tool_id", "borrower_id", "borrowed_at", "due_at", "created_at", "updated_at")
SELECT gen_random_uuid(), "id", "borrowed_by",
       COALESCE("borrowed_date"::timestamp, now()),
       "estimated_return_date",
       now(), now()
FROM "tools"
WHERE "borrowed_by" IS NOT NULL;

-- At most one open borrow per tool. Prisma cannot express a partial unique
-- index, so it lives here — same as tracker_devices_active_vehicle_unique.
--
-- This is the invariant the whole feature rests on: without it, a bug in the
-- write path double-counts a tool as out and every metric on the page is wrong.
--
-- Created AFTER the backfill on purpose, so a pre-existing duplicate fails the
-- migration loudly rather than slipping past.
CREATE UNIQUE INDEX "tool_borrows_open_unique"
  ON "tool_borrows" ("tool_id") WHERE "returned_at" IS NULL;
