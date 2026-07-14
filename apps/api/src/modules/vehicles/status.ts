import { Prisma, type VehicleStatus } from '@prisma/client';
import { AppError } from '../../lib/errors.js';

export type StatusChangeSource =
  | 'manual_edit'
  | 'trip_check_out'
  | 'trip_check_in'
  | 'job_order_note'
  | 'job_order_complete';

interface ChangeStatusOpts {
  changedBy?: string | null;
  reason?: string | null;
  source: StatusChangeSource;
  // When set, the flip only happens if the vehicle is currently in one of these
  // statuses; otherwise it is skipped (no update, no audit) and false is
  // returned — the calling transition still succeeds (spec §6.1/§6.2).
  expectedFrom?: VehicleStatus | VehicleStatus[];
}

// A hard precondition on the vehicle's CURRENT status.
//
// `expectedFrom` below is deliberately soft — it skips the flip and lets the
// transition succeed. That is right when the physical event has already happened
// and we are only recording it (a van coming back through the gate is back,
// whatever the row says). It is WRONG when we are about to authorise a physical
// act: it let a guard release a van that was in the workshop, and let a second
// trip check out a van that was already on the road, in both cases leaving the
// vehicle's status quietly contradicting reality. Those callers use this instead.
export async function requireVehicleStatus(
  client: Prisma.TransactionClient,
  vehicleId: string,
  allowed: VehicleStatus[],
  code: string,
  message: (current: VehicleStatus) => string
): Promise<{ status: VehicleStatus; mileage: number }> {
  const vehicle = await client.vehicle.findUnique({
    where: { id: vehicleId },
    select: { status: true, mileage: true }
  });
  if (!vehicle) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');
  if (!allowed.includes(vehicle.status)) {
    throw new AppError(409, code, message(vehicle.status));
  }
  return vehicle;
}

// The odometer only ever goes forward. A reading below the one already on the
// vehicle is a typo, not a fact — take it as an error rather than silently
// rewinding the number every maintenance calculation depends on.
export async function advanceOdometer(
  client: Prisma.TransactionClient,
  vehicleId: string,
  reading: number,
  currentMileage: number
): Promise<void> {
  if (reading < currentMileage) {
    throw new AppError(
      409,
      'ODOMETER_BACKWARDS',
      `Odometer reading ${reading} km is below the vehicle's current ${currentMileage} km`
    );
  }
  if (reading === currentMileage) return;
  await client.vehicle.update({ where: { id: vehicleId }, data: { mileage: reading } });
}

// Spec §4.2: the single choke point for EVERY vehicle status flip. Updates the
// status column and records a vehicle_status_audit row IN THE CALLER'S
// transaction. Returns true if it flipped, false if skipped.
export async function changeVehicleStatus(
  client: Prisma.TransactionClient,
  vehicleId: string,
  newStatus: VehicleStatus,
  opts: ChangeStatusOpts
): Promise<boolean> {
  const vehicle = await client.vehicle.findUnique({
    where: { id: vehicleId },
    select: { status: true }
  });
  if (!vehicle) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');
  if (opts.expectedFrom !== undefined) {
    const allowed = Array.isArray(opts.expectedFrom) ? opts.expectedFrom : [opts.expectedFrom];
    if (!allowed.includes(vehicle.status)) return false; // skip-and-log
  }
  if (vehicle.status === newStatus) return false;
  await client.vehicle.update({ where: { id: vehicleId }, data: { status: newStatus } });
  await client.vehicleStatusAudit.create({
    data: {
      vehicleId,
      oldStatus: vehicle.status,
      newStatus,
      changedBy: opts.changedBy ?? null,
      changeSource: opts.source,
      reason: opts.reason ?? null
    }
  });
  return true;
}
