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
}

// Spec §4.2: the single choke point for EVERY vehicle status flip. Updates the
// status column and records a vehicle_status_audit row IN THE CALLER'S
// transaction, so the audit can never miss a change. No-op (no audit row) when
// the status is unchanged. Plan 5's trip/job-order transitions call this.
export async function changeVehicleStatus(
  client: Prisma.TransactionClient,
  vehicleId: string,
  newStatus: VehicleStatus,
  opts: ChangeStatusOpts
): Promise<void> {
  const vehicle = await client.vehicle.findUnique({
    where: { id: vehicleId },
    select: { status: true }
  });
  if (!vehicle) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');
  if (vehicle.status === newStatus) return;
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
}
