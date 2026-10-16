import {
  DriverStatus,
  FuelType,
  JobOrderStatus,
  MaintenanceType,
  RepairType,
  ToolStatus,
  TrackerDeviceStatus,
  TripTicketStatus,
  UserStatus,
  VehicleStatus,
  type Prisma
} from '@prisma/client';
import { STATUS_LABELS } from '@mms/shared';

// Every word must match a visible field. This also finds composed labels such
// as "Toyota Hiace" without requiring a stored vehicle display-name column.
function words<T>(search: string | undefined, fields: (word: string) => T[]) {
  const terms = search?.trim().split(/\s+/).filter(Boolean) ?? [];
  return terms.length
    ? { AND: terms.map((word) => ({ OR: fields(word) })) }
    : {};
}

const text = (word: string) => ({
  contains: word.replace(/[\\%_]/g, '\\$&'),
  mode: 'insensitive' as const
});

function enums<T extends string>(values: Record<string, T>, word: string): T[] {
  const term = word.toLowerCase();
  return Object.values(values).filter((value) =>
    [value.replace(/_/g, ' '), STATUS_LABELS[value] ?? ''].some((label) =>
      label.toLowerCase().includes(term)
    )
  );
}

// References are integer-backed. The list services project scoped reference
// numbers only for numeric searches; matching their display text gives the
// same substring behavior as approval and requester history.
function reference(
  prefix: string,
  word: string,
  numbers: readonly number[]
): Prisma.IntFilter[] {
  const term = word.toLowerCase();
  if (`${prefix}-`.toLowerCase().includes(term)) return [{}];
  const matches = numbers.filter((number) =>
    `${prefix}-${number}`.toLowerCase().includes(term)
  );
  return matches.length ? [{ in: matches }] : [];
}

const vehicleFields = (word: string): Prisma.VehicleWhereInput[] => [
  { make: text(word) },
  { model: text(word) },
  { licensePlate: text(word) }
];

export const driverSearch = (search?: string): Prisma.DriverWhereInput =>
  words<Prisma.DriverWhereInput>(search, (word) => [
    { fullName: text(word) },
    { email: text(word) },
    { licenseNumber: text(word) },
    { licenseType: text(word) },
    { phone: text(word) },
    { status: { in: enums(DriverStatus, word) } }
  ]);

export const vehicleSearch = (search?: string): Prisma.VehicleWhereInput =>
  words<Prisma.VehicleWhereInput>(search, (word) => [
    ...vehicleFields(word),
    { branch: { name: text(word) } },
    { status: { in: enums(VehicleStatus, word) } },
    { fuelType: { in: enums(FuelType, word) } }
  ]);

export const sparePartSearch = (search?: string): Prisma.SparePartWhereInput =>
  words<Prisma.SparePartWhereInput>(search, (word) => [
    { name: text(word) },
    { brand: text(word) },
    { description: text(word) },
    ...('in stock'.includes(word.toLowerCase())
      ? [{ quantity: { gt: 5 } }]
      : []),
    ...('low stock'.includes(word.toLowerCase())
      ? [{ quantity: { gt: 0, lte: 5 } }]
      : []),
    ...('out of stock'.includes(word.toLowerCase()) ? [{ quantity: 0 }] : [])
  ]);

export const toolSearch = (search?: string): Prisma.ToolWhereInput =>
  words<Prisma.ToolWhereInput>(search, (word) => [
    { name: text(word) },
    { description: text(word) },
    { borrowedBy: { fullName: text(word) } },
    { status: { in: enums(ToolStatus, word) } }
  ]);

export const trackerSearch = (
  search?: string
): Prisma.TrackerDeviceWhereInput =>
  words<Prisma.TrackerDeviceWhereInput>(search, (word) => [
    { imei: text(word) },
    { label: text(word) },
    { simNumber: text(word) },
    { vehicle: { OR: vehicleFields(word) } },
    { status: { in: enums(TrackerDeviceStatus, word) } }
  ]);

export const maintenanceSearch = (
  search?: string
): Prisma.MaintenanceWhereInput =>
  words<Prisma.MaintenanceWhereInput>(search, (word) => [
    { description: text(word) },
    { type: { in: enums(MaintenanceType, word) } },
    { vehicle: { OR: vehicleFields(word) } }
  ]);

export const jobOrderSearch = (
  search?: string,
  referenceNumbers: readonly number[] = []
): Prisma.JobOrderWhereInput =>
  words<Prisma.JobOrderWhereInput>(search, (word) => [
    { incidentDetails: text(word) },
    { vehicle: { OR: vehicleFields(word) } },
    { assignedMechanic: { fullName: text(word) } },
    { status: { in: enums(JobOrderStatus, word) } },
    { repairDone: { in: enums(RepairType, word) } },
    ...reference('JO', word, referenceNumbers).map((orderNo) => ({ orderNo }))
  ]);

export const tripTicketSearch = (
  search?: string,
  referenceNumbers: readonly number[] = []
): Prisma.TripTicketWhereInput =>
  words<Prisma.TripTicketWhereInput>(search, (word) => [
    { destination: text(word) },
    { purpose: text(word) },
    { vehicle: { OR: vehicleFields(word) } },
    { driver: { fullName: text(word) } },
    { branch: { name: text(word) } },
    { status: { in: enums(TripTicketStatus, word) } },
    ...reference('TT', word, referenceNumbers).map((ticketNo) => ({ ticketNo }))
  ]);

export const userSearch = (search?: string): Prisma.UserWhereInput =>
  words<Prisma.UserWhereInput>(search, (word) => [
    { fullName: text(word) },
    { email: text(word) },
    { branch: { name: text(word) } },
    { userRole: { role: { name: text(word) } } },
    { status: { in: enums(UserStatus, word) } }
  ]);
