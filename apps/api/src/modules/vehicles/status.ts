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
