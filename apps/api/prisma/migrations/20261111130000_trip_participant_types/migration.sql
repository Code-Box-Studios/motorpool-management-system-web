CREATE TYPE "TripParticipantType" AS ENUM ('students', 'employees');

-- Existing free-text participant lists remain student trips with their names intact.
ALTER TABLE "trip_tickets"
  ADD COLUMN "participant_type" "TripParticipantType" NOT NULL DEFAULT 'students';

CREATE TABLE "trip_ticket_participants" (
  "trip_ticket_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trip_ticket_participants_pkey" PRIMARY KEY ("trip_ticket_id", "employee_id"),
  CONSTRAINT "trip_ticket_participants_trip_ticket_id_fkey"
    FOREIGN KEY ("trip_ticket_id") REFERENCES "trip_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "trip_ticket_participants_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "trip_ticket_participants_employee_id_idx" ON "trip_ticket_participants"("employee_id");
