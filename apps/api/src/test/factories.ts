import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/password.js';
import { signAccessToken } from '../lib/jwt.js';

interface CreateTestUserOptions {
  email?: string;
  role?: string;
  password?: string;
  status?: 'active' | 'inactive';
  branchId?: string;
  fullName?: string;
}

// Creates a role (idempotent) + user + user_roles row for integration tests.
export async function createTestUser(opts: CreateTestUserOptions = {}) {
  const {
    email = 'admin@test.local',
    role = 'admin',
    password = 'Password123!',
    status = 'active',
    branchId,
    fullName = 'Test User'
  } = opts;

  const roleRow = await prisma.role.upsert({
    where: { name: role },
    update: {},
    create: { name: role }
  });
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      fullName,
      status,
      branchId,
      userRole: { create: { roleId: roleRow.id } }
    }
  });
  return { user: { id: user.id, email: user.email }, password };
}

// Bearer header for an arbitrary identity — no login round-trip needed.
export function authHeader(
  userId: string,
  email: string,
  role: string,
  branchId: string | null = null
): string {
  return `Bearer ${signAccessToken({ sub: userId, email, role, branchId })}`;
}

// Create a test branch for integration tests.
export async function createTestBranch(name = 'Test Branch') {
  return prisma.branch.create({ data: { name, location: 'Testville' } });
}

// Minimal valid vehicle. Every required column gets a value; callers override
// what their test is actually about.
export async function createTestVehicle(
  branchId: string,
  overrides: Partial<{ licensePlate: string; vin: string }> = {}
) {
  return prisma.vehicle.create({
    data: {
      make: 'Toyota',
      model: 'Hiace',
      year: 2021,
      vin: overrides.vin ?? 'JT-VIN-GUARD',
      licensePlate: overrides.licensePlate ?? 'GRD-0001',
      capacity: 12,
      fuelType: 'diesel',
      mileage: 1000,
      insuranceExpiry: new Date('2027-01-01'),
      registrationExpiry: new Date('2027-03-01'),
      branchId
    }
  });
}

export async function createTestDriver(
  branchId: string,
  status: 'active' | 'inactive' | 'on_trip' = 'active',
  email = 'driver.guard@test.local'
) {
  return prisma.driver.create({
    data: { email, fullName: 'Guard Driver', status, branchId }
  });
}

export async function createTestOffice(branchId: string, name = 'Ops') {
  return prisma.departmentOffice.create({ data: { name, branchId } });
}

export async function createTestOfficeHead(
  branchId: string,
  officeId: string | null = null,
  name = 'Maria Santos'
) {
  return prisma.officeHead.create({ data: { name, branchId, officeId } });
}

// `preparedBy` is required with no default in schema.prisma — omitting it
// throws at runtime, not at typecheck.
export async function createTestTicket(opts: {
  branchId: string;
  driverId: string;
  vehicleId: string;
  // Full TripTicketStatus enum, not just the ones the first test file needed —
  // Tasks 3-5 exercise disapproved/pending_fuel_allocation_approval too.
  status?:
    | 'pending_admin_approval'
    | 'pending_fuel_allocation_approval'
    | 'approved'
    | 'in_progress'
    | 'completed'
    | 'cancelled'
    | 'disapproved';
  officeId?: string | null;
  officeHeadId?: string | null;
}) {
  return prisma.tripTicket.create({
    data: {
      branchId: opts.branchId,
      driverId: opts.driverId,
      vehicleId: opts.vehicleId,
      officeId: opts.officeId ?? null,
      officeHeadId: opts.officeHeadId ?? null,
      destination: 'Somewhere',
      purpose: 'Testing',
      dateRequested: new Date('2026-08-26'),
      preparedBy: 'Test',
      status: opts.status ?? 'approved'
    }
  });
}
