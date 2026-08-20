import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { createTestBranch } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

// Copied verbatim from the migration's backfill INSERT. Keeping one copy here
// and one in the migration is deliberate: this test asserts that THIS
// statement is idempotent and maps statuses correctly.
const BACKFILL_SQL = `
INSERT INTO "trip_dates" (
  "id", "trip_ticket_id", "start_ts", "end_ts", "status",
  "start_mileage", "end_mileage",
  "pre_trip_guard", "pre_trip_checked_by", "pre_trip_checked_at",
  "post_trip_guard", "post_trip_checked_by", "post_trip_checked_at",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), t."id", t."start_ts", t."end_ts",
  CASE t."status"
    WHEN 'in_progress'  THEN 'in_progress'::"TripDateStatus"
    WHEN 'completed'    THEN 'completed'::"TripDateStatus"
    WHEN 'cancelled'    THEN 'cancelled'::"TripDateStatus"
    WHEN 'disapproved'  THEN 'cancelled'::"TripDateStatus"
    ELSE 'scheduled'::"TripDateStatus"
  END,
  t."start_mileage", t."end_mileage",
  t."pre_trip_guard", t."pre_trip_checked_by", t."pre_trip_checked_at",
  t."post_trip_guard", t."post_trip_checked_by", t."post_trip_checked_at",
  NOW(), NOW()
FROM "trip_tickets" t
WHERE t."start_ts" IS NOT NULL
  AND t."end_ts" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "trip_dates" d WHERE d."trip_ticket_id" = t."id"
  );
`;

// The backfill lives in the migration, so this asserts the SHAPE it produces:
// every windowed ticket ends up with exactly one date row carrying its facts.
describe('trip date backfill shape', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('gives a completed ticket one completed date row carrying its odometer', async () => {
    const branch = await createTestBranch();
    const vehicle = await prisma.vehicle.create({
      data: {
        make: 'T',
        model: 'H',
        year: 2021,
        vin: 'BF1',
        licensePlate: 'BF1',
        capacity: 5,
        fuelType: 'diesel',
        mileage: 1000,
        status: 'available',
        branchId: branch.id,
        insuranceExpiry: new Date('2027-01-01'),
        registrationExpiry: new Date('2027-01-01')
      }
    });
    const driver = await prisma.driver.create({
      data: {
        email: 'bf@test.local',
        fullName: 'BF',
        status: 'active',
        branchId: branch.id
      }
    });
    const start = new Date(Date.now() + 86_400_000);
    const end = new Date(start.getTime() + 3_600_000);
    const ticket = await prisma.tripTicket.create({
      data: {
        branchId: branch.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        destination: 'D',
        purpose: 'P',
        dateRequested: new Date(),
        preparedBy: '',
        status: 'completed',
        startTs: start,
        endTs: end,
        startMileage: 1000,
        endMileage: 1120
      }
    });

    await prisma.$executeRawUnsafe(BACKFILL_SQL);

    const dates = await prisma.tripDate.findMany({
      where: { tripTicketId: ticket.id }
    });
    expect(dates).toHaveLength(1);
    const date = dates[0]!;
    expect(date.status).toBe('completed');
    expect(date.startMileage).toBe(1000);
    expect(date.endMileage).toBe(1120);
    expect(date.startTs.toISOString()).toBe(start.toISOString());
  });

  it('is idempotent — a second run adds nothing', async () => {
    const branch = await createTestBranch();
    const vehicle = await prisma.vehicle.create({
      data: {
        make: 'T',
        model: 'H',
        year: 2021,
        vin: 'BF2',
        licensePlate: 'BF2',
        capacity: 5,
        fuelType: 'diesel',
        mileage: 1000,
        status: 'available',
        branchId: branch.id,
        insuranceExpiry: new Date('2027-01-01'),
        registrationExpiry: new Date('2027-01-01')
      }
    });
    const driver = await prisma.driver.create({
      data: {
        email: 'bf2@test.local',
        fullName: 'BF2',
        status: 'active',
        branchId: branch.id
      }
    });
    const start = new Date(Date.now() + 86_400_000);
    const ticket = await prisma.tripTicket.create({
      data: {
        branchId: branch.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        destination: 'D',
        purpose: 'P',
        dateRequested: new Date(),
        preparedBy: '',
        status: 'approved',
        startTs: start,
        endTs: new Date(start.getTime() + 3_600_000)
      }
    });

    await prisma.$executeRawUnsafe(BACKFILL_SQL);
    await prisma.$executeRawUnsafe(BACKFILL_SQL);

    expect(
      await prisma.tripDate.count({ where: { tripTicketId: ticket.id } })
    ).toBe(1);
  });
});
