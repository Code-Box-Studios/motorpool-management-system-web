import type {
  CreateTrackerDeviceBody,
  ResolveDeviceResponse,
  TrackerDevicesListQuery,
  UpdateTrackerDeviceBody
} from '@mms/shared';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { toOrderBy } from '../../lib/sorting.js';
import { prisma } from '../../lib/prisma.js';
import {
  findTrackerDeviceById,
  findTrackerDeviceByImei,
  listTrackerDevices
} from './repository.js';

export async function list(query: TrackerDevicesListQuery) {
  const { vehicleId, status, sortBy, sortOrder, ...page } = query;
  const orderBy = toOrderBy<Prisma.TrackerDeviceOrderByWithRelationInput>(
    sortBy,
    sortOrder,
    {
      imei: (order) => ({ imei: order }),
      label: (order) => ({ label: order }),
      simNumber: (order) => ({ simNumber: order }),
      status: (order) => ({ status: order }),
      lastSeenAt: (order) => ({ lastSeenAt: order })
    },
    { updatedAt: 'desc' }
  );
  return listTrackerDevices(toSkipTake(page), { vehicleId, status }, orderBy);
}

export async function getById(id: string) {
  const device = await findTrackerDeviceById(id);
  if (!device) throw new AppError(404, 'NOT_FOUND', 'Tracker device not found');
  return device;
}

// Rejects assigning a second ACTIVE tracker to a vehicle that already has one.
async function assertVehicleFree(
  vehicleId: string,
  excludeDeviceId?: string
): Promise<void> {
  const existing = await prisma.trackerDevice.findFirst({
    where: {
      vehicleId,
      status: 'active',
      ...(excludeDeviceId ? { id: { not: excludeDeviceId } } : {})
    }
  });
  if (existing) {
    throw new AppError(
      409,
      'VEHICLE_HAS_ACTIVE_DEVICE',
      'Vehicle already has an active tracker'
    );
  }
}

export async function create(body: CreateTrackerDeviceBody) {
  if (await findTrackerDeviceByImei(body.imei)) {
    throw new AppError(
      409,
      'IMEI_TAKEN',
      'A device with this IMEI already exists'
    );
  }
  if (body.status === 'active' && body.vehicleId) {
    await assertVehicleFree(body.vehicleId);
  }
  return prisma.trackerDevice.create({ data: body });
}

export async function update(id: string, body: UpdateTrackerDeviceBody) {
  const existing = await findTrackerDeviceById(id);
  if (!existing)
    throw new AppError(404, 'NOT_FOUND', 'Tracker device not found');
  if (body.imei && body.imei !== existing.imei) {
    const clash = await findTrackerDeviceByImei(body.imei);
    if (clash)
      throw new AppError(
        409,
        'IMEI_TAKEN',
        'A device with this IMEI already exists'
      );
  }
  const nextStatus = body.status ?? existing.status;
  const nextVehicleId =
    body.vehicleId !== undefined ? body.vehicleId : existing.vehicleId;
  if (nextStatus === 'active' && nextVehicleId) {
    await assertVehicleFree(nextVehicleId, id);
  }
  return prisma.trackerDevice.update({ where: { id }, data: body });
}

export async function remove(id: string): Promise<void> {
  const existing = await findTrackerDeviceById(id);
  if (!existing)
    throw new AppError(404, 'NOT_FOUND', 'Tracker device not found');
  await prisma.trackerDevice.delete({ where: { id } });
}

// Gateway lookup: map the reported device id (IMEI) to a vehicle. Only `active`
// devices resolve; a hit stamps lastSeenAt (liveness) before the vehicle check.
export async function resolve(
  deviceId: string
): Promise<ResolveDeviceResponse> {
  const device = await findTrackerDeviceByImei(deviceId);
  if (!device || device.status !== 'active') {
    throw new AppError(404, 'DEVICE_NOT_FOUND', 'Unknown or inactive device');
  }
  await prisma.trackerDevice.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date() }
  });
  if (!device.vehicleId) {
    throw new AppError(
      404,
      'NO_VEHICLE_ASSIGNED',
      'Device is not assigned to a vehicle'
    );
  }
  return { vehicleId: device.vehicleId };
}
