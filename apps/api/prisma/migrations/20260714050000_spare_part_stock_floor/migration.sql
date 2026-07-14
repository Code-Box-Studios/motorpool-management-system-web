-- Spare-part stock can never be negative.
--
-- Parts are now issued when a job order is NOTED (committed to the repair) and
-- returned if the job is abandoned, so the API can no longer drive a count below
-- zero. This makes that true of the database as well, rather than by convention:
-- any future path that tries to over-issue fails loudly here instead of quietly
-- corrupting the shelf.
--
-- Anything already negative is a pre-existing over-issue from the old
-- complete-repair decrement, which had no floor. Floor it at zero first, or the
-- constraint cannot be added.
UPDATE "spare_parts" SET "quantity" = 0 WHERE "quantity" < 0;

ALTER TABLE "spare_parts"
  ADD CONSTRAINT "spare_parts_quantity_non_negative" CHECK ("quantity" >= 0);
