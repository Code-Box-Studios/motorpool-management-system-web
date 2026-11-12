import type { Prisma } from '@prisma/client';

// Booking and operational readers need driver identity, contact, assignment,
// and driving credentials. Personnel, emergency, and internal notes stay private.
export const operationalDriverSelect = {
  id: true,
  userId: true,
  email: true,
  fullName: true,
  photo: true,
  phone: true,
  licenseNumber: true,
  licenseType: true,
  licenseExpiry: true,
  status: true,
  assignedVehicleId: true,
  branchId: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.DriverSelect;

type OperationalDriver = Prisma.DriverGetPayload<{
  select: typeof operationalDriverSelect;
}>;

export function toOperationalDriver(
  driver: OperationalDriver
): OperationalDriver {
  return {
    id: driver.id,
    userId: driver.userId,
    email: driver.email,
    fullName: driver.fullName,
    photo: driver.photo,
    phone: driver.phone,
    licenseNumber: driver.licenseNumber,
    licenseType: driver.licenseType,
    licenseExpiry: driver.licenseExpiry,
    status: driver.status,
    assignedVehicleId: driver.assignedVehicleId,
    branchId: driver.branchId,
    createdAt: driver.createdAt,
    updatedAt: driver.updatedAt
  };
}
