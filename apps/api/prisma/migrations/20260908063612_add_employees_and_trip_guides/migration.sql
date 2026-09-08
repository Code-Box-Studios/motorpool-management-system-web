-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "phone" TEXT,
    "branch_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_ticket_employees" (
    "trip_ticket_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_ticket_employees_pkey" PRIMARY KEY ("trip_ticket_id","employee_id")
);

-- CreateIndex
CREATE INDEX "employees_branch_id_idx" ON "employees"("branch_id");

-- CreateIndex
CREATE INDEX "trip_ticket_employees_employee_id_idx" ON "trip_ticket_employees"("employee_id");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_ticket_employees" ADD CONSTRAINT "trip_ticket_employees_trip_ticket_id_fkey" FOREIGN KEY ("trip_ticket_id") REFERENCES "trip_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_ticket_employees" ADD CONSTRAINT "trip_ticket_employees_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- NOTE: no unique index on employees.name, deliberately. branches and
-- department_offices both carry a case-insensitive functional unique index;
-- employees does not, and must not. Employees are people, and two of them
-- named Juan Cruz at one branch is not an error — the same rule
-- organization/service.ts:185 already states for office heads. Adding one
-- later would reject legitimate rows with a 409 that has no correct fix.
