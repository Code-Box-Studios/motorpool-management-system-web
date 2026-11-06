import { trackerSearch } from '../../lib/list-search.js';
import type {
  CreateTrackerDeviceBody,
  ResolveDeviceResponse,
  TrackerDevicesListQuery,
  UpdateTrackerDeviceBody,
  UpdateTrackerConfigurationBody,
  TrackerConfiguration
} from '@mms/shared';
import { parseTrackerRconfReply } from '@mms/shared';
import { Prisma } from '@prisma/client';
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
  const { vehicleId, status, assignment, sortBy, sortOrder, ...page } = query;
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
  return listTrackerDevices(
    toSkipTake(page),
    { vehicleId, status, assignment },
    orderBy,
    trackerSearch(query.search)
  );
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
  const saved = await prisma.trackerDevice.updateMany({
    // Do not restore a replaced identifier over another unit's configuration.
    where: { id, imei: existing.imei },
    data: {
      ...body,
      // A changed identifier names a different unit; its old snapshot no longer applies.
      ...(body.imei && body.imei !== existing.imei ? { configuration: Prisma.DbNull } : {})
    }
  });
  if (!saved.count) {
    throw new AppError(409, 'TRACKER_CHANGED', 'The tracker changed. Refresh its details before saving changes.');
  }
  return getById(id);
}

export async function updateConfiguration(id: string, body: UpdateTrackerConfigurationBody) {
  const device = await getById(id);
  let settings;
  try {
    settings = parseTrackerRconfReply(body.reply);
  } catch {
    throw new AppError(400, 'INVALID_TRACKER_CONFIGURATION', 'Paste a valid ST-901 RCONF reply with its device ID and settings.');
  }
  if (settings.deviceId !== device.imei) {
    throw new AppError(400, 'TRACKER_ID_MISMATCH', 'The RCONF device ID does not match this registered tracker.');
  }
  const configuration: TrackerConfiguration = {
    ...settings, source: 'rconf', recordedAt: new Date().toISOString()
  };
  // Match the identifier again at write time so a concurrent edit cannot attach
  // one unit's report to a newly registered unit. Store no raw reply or secrets.
  const saved = await prisma.trackerDevice.updateMany({
    where: { id, imei: device.imei },
    data: { configuration: { ...configuration } }
  });
  if (!saved.count) {
    throw new AppError(409, 'TRACKER_CHANGED', 'The tracker changed. Refresh its details before saving configuration.');
  }
  return getById(id);
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
