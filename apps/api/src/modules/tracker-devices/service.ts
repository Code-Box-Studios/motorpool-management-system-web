import type { CreateTrackerDeviceBody, TrackerDevicesListQuery, UpdateTrackerDeviceBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import { findTrackerDeviceById, findTrackerDeviceByImei, listTrackerDevices } from './repository.js';

export async function list(query: TrackerDevicesListQuery) {
  const { vehicleId, status, ...page } = query;
  return listTrackerDevices(toSkipTake(page), { vehicleId, status });
}

export async function getById(id: string) {
  const device = await findTrackerDeviceById(id);
  if (!device) throw new AppError(404, 'NOT_FOUND', 'Tracker device not found');
  return device;
}

export async function create(body: CreateTrackerDeviceBody) {
  if (await findTrackerDeviceByImei(body.imei)) {
    throw new AppError(409, 'IMEI_TAKEN', 'A device with this IMEI already exists');
  }
  return prisma.trackerDevice.create({ data: body });
}

export async function update(id: string, body: UpdateTrackerDeviceBody) {
  const existing = await findTrackerDeviceById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Tracker device not found');
  if (body.imei && body.imei !== existing.imei) {
    const clash = await findTrackerDeviceByImei(body.imei);
    if (clash) throw new AppError(409, 'IMEI_TAKEN', 'A device with this IMEI already exists');
  }
  return prisma.trackerDevice.update({ where: { id }, data: body });
}

export async function remove(id: string): Promise<void> {
  const existing = await findTrackerDeviceById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Tracker device not found');
  await prisma.trackerDevice.delete({ where: { id } });
}
