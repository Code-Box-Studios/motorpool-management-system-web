-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "department_offices" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "office_heads" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- Case-insensitive uniqueness. Prisma cannot express a functional index in
-- schema.prisma, so these are hand-written. They span archived rows on
-- purpose: restoring an archived "North Branch" must not collide with a new
-- one, and reusing the name would make the archived row ambiguous in
-- historical trip tickets.
CREATE UNIQUE INDEX "branches_name_lower_unique"
  ON "branches" (lower("name"));

CREATE UNIQUE INDEX "department_offices_branch_name_lower_unique"
  ON "department_offices" ("branch_id", lower("name"));
