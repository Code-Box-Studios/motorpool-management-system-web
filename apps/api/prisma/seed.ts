import { PrismaClient, TripTicketStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Deterministic demo data — idempotent via upsert/deleteMany-then-create.
async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 12);

  // Roles
  const roleNames = ['admin', 'security_guard', 'evp_operations', 'driver', 'requester'];
  const roles: Record<string, { id: string }> = {};
  for (const name of roleNames) {
    roles[name] = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, description: `${name} role` }
    });
  }

  // Branches
  const mainBranch = await prisma.branch.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: { id: '00000000-0000-4000-8000-000000000001', name: 'Main Branch', location: 'Head Office' }
  });
  await prisma.branch.upsert({
    where: { id: '00000000-0000-4000-8000-000000000002' },
    update: {},
    create: { id: '00000000-0000-4000-8000-000000000002', name: 'North Branch', location: 'North Depot' }
  });

  // Offices + heads
  const office = await prisma.departmentOffice.upsert({
    where: { id: '00000000-0000-4000-8000-000000000011' },
    update: {},
    create: { id: '00000000-0000-4000-8000-000000000011', name: 'Operations Office', branchId: mainBranch.id }
  });
  const head = await prisma.officeHead.upsert({
    where: { id: '00000000-0000-4000-8000-000000000021' },
    update: {},
    create: { id: '00000000-0000-4000-8000-000000000021', name: 'Maria Santos', branchId: mainBranch.id, officeId: office.id }
  });
  await prisma.departmentOffice.update({ where: { id: office.id }, data: { headId: head.id } });

  // One user per role (+ linked driver row for the driver-role user)
  const users: Record<string, { id: string }> = {};
  for (const name of roleNames) {
    const user = await prisma.user.upsert({
      where: { email: `${name}@mms.local` },
      update: {},
      create: {
        email: `${name}@mms.local`,
        passwordHash,
        fullName: name.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        status: 'active',
        branchId: mainBranch.id,
        userRole: { create: { roleId: roles[name].id } }
      }
    });
    users[name] = user;
  }

  // Vehicles (6, across statuses)
  const vehicleSpecs = [
    { make: 'Toyota', model: 'Hiace', plate: 'MMS-0001', status: 'available' },
    { make: 'Toyota', model: 'Fortuner', plate: 'MMS-0002', status: 'available' },
    { make: 'Mitsubishi', model: 'L300', plate: 'MMS-0003', status: 'on_trip' },
    { make: 'Isuzu', model: 'Traviz', plate: 'MMS-0004', status: 'under_maintenance' },
    { make: 'Ford', model: 'Ranger', plate: 'MMS-0005', status: 'out_of_service' },
    { make: 'Nissan', model: 'Urvan', plate: 'MMS-0006', status: 'unavailable' }
  ] as const;
  const vehicles = [];
  for (const [i, v] of vehicleSpecs.entries()) {
    const existing = await prisma.vehicle.findFirst({ where: { licensePlate: v.plate } });
    vehicles.push(
      existing ??
        (await prisma.vehicle.create({
          data: {
            make: v.make, model: v.model, year: 2020 + (i % 5),
            vin: `VIN${String(i + 1).padStart(8, '0')}`,
            licensePlate: v.plate, capacity: 4 + i, fuelType: 'diesel',
            mileage: 25000 + i * 8000, status: v.status,
            insuranceExpiry: new Date('2026-12-31'), registrationExpiry: new Date('2026-12-31'),
            branchId: mainBranch.id
          }
        }))
    );
  }

  // Drivers (5; first one linked to the driver-role user)
  const driverSpecs = ['Juan Dela Cruz', 'Pedro Reyes', 'Jose Ramos', 'Carlo Aquino', 'Rico Bautista'];
  const drivers = [];
  for (const [i, fullName] of driverSpecs.entries()) {
    const email = i === 0 ? 'driver@mms.local' : `driver${i + 1}@mms.local`;
    drivers.push(
      await prisma.driver.upsert({
        where: { email },
        update: {},
        create: {
          email, fullName, status: i === 2 ? 'on_trip' : 'active',
          userId: i === 0 ? users.driver.id : undefined,
          licenseNumber: `N01-${10 + i}-00${i}231`, licenseType: 'Professional',
          licenseExpiry: new Date('2027-06-30'), branchId: mainBranch.id,
          hireDate: new Date('2024-01-15')
        }
      })
    );
  }

  // Spare parts (10)
  const partNames = ['Oil Filter', 'Air Filter', 'Brake Pads', 'Brake Fluid', 'Engine Oil', 'Fan Belt', 'Spark Plugs', 'Battery', 'Wiper Blades', 'Coolant'];
  const parts = [];
  for (const name of partNames) {
    const existing = await prisma.sparePart.findFirst({ where: { name } });
    parts.push(existing ?? (await prisma.sparePart.create({ data: { name, brand: 'OEM', quantity: 20 } })));
  }

  // Tools (6, one borrowed)
  const toolNames = ['Hydraulic Jack', 'Torque Wrench', 'Socket Set', 'Multimeter', 'Impact Driver', 'Tire Inflator'];
  for (const [i, name] of toolNames.entries()) {
    const existing = await prisma.tool.findFirst({ where: { name } });
    if (!existing) {
      await prisma.tool.create({
        data: {
          name,
          status: i === 0 ? 'borrowed' : 'available',
          borrowedById: i === 0 ? drivers[1].id : undefined,
          borrowedDate: i === 0 ? new Date('2026-06-20') : undefined,
          estimatedReturnDate: i === 0 ? new Date('2026-07-20') : undefined
        }
      });
    }
  }

  // Maintenance standard + schedule items
  let standard = await prisma.maintenanceStandard.findFirst({ where: { name: 'Standard PMS' } });
  standard ??= await prisma.maintenanceStandard.create({
    data: {
      name: 'Standard PMS',
      description: 'Preventive maintenance schedule',
      scheduleItems: {
        create: [
          { taskName: 'Change Oil', intervalType: 'mileage', intervalMileage: 5000 },
          { taskName: 'Rotate Tires', intervalType: 'mileage', intervalMileage: 10000 },
          { taskName: 'Replace Coolant', intervalType: 'time', intervalMonths: 12 }
        ]
      }
    }
  });

  // Maintenance history
  if ((await prisma.maintenance.count()) === 0) {
    await prisma.maintenance.createMany({
      data: vehicles.slice(0, 4).map((v, i) => ({
        vehicleId: v.id, type: 'preventive' as const,
        date: new Date(`2026-0${i + 2}-15`), cost: 3500 + i * 500, mileage: 20000 + i * 5000,
        description: 'Scheduled PMS'
      }))
    });
  }

  // Trip tickets — one per status; allocations only at/after pending_fuel_allocation_approval (spec §6.1/§14)
  const statuses: TripTicketStatus[] = [
    'pending_admin_approval', 'pending_fuel_allocation_approval', 'approved',
    'in_progress', 'completed', 'cancelled', 'disapproved'
  ];
  const hasAllocation = new Set<TripTicketStatus>(['pending_fuel_allocation_approval', 'approved', 'in_progress', 'completed']);
  if ((await prisma.tripTicket.count()) === 0) {
    for (const [i, status] of statuses.entries()) {
      const vehicle = vehicles[i % vehicles.length];
      const guarded = status === 'in_progress' || status === 'completed';
      await prisma.tripTicket.create({
        data: {
          branchId: mainBranch.id, driverId: drivers[i % drivers.length].id, vehicleId: vehicle.id,
          officeId: office.id, officeHeadId: head.id,
          destination: `Destination ${i + 1}`, purpose: `Official business ${i + 1}`,
          dateRequested: new Date('2026-06-01'), participants: ['Staff A', 'Staff B'],
          participantsCount: 2, preparedBy: 'Requester User', requestedById: users.requester.id,
          status,
          approvedByAdminId: status === 'pending_admin_approval' ? undefined : users.admin.id,
          disapprovedReason: status === 'disapproved' ? 'Vehicle not available' : undefined,
          cancellationReason: status === 'cancelled' ? 'Trip no longer needed' : undefined,
          preTripGuardId: guarded ? users.security_guard.id : undefined,
          preTripCheckedById: guarded ? users.security_guard.id : undefined,
          preTripCheckedAt: guarded ? new Date('2026-06-02T08:00:00Z') : undefined,
          postTripGuardId: status === 'completed' ? users.security_guard.id : undefined,
          postTripCheckedById: status === 'completed' ? users.security_guard.id : undefined,
          postTripCheckedAt: status === 'completed' ? new Date('2026-06-02T17:00:00Z') : undefined,
          startTs: new Date('2026-06-02T08:00:00Z'), endTs: new Date('2026-06-02T17:00:00Z'),
          fuelAllocation: hasAllocation.has(status)
            ? {
                create: {
                  vehicleId: vehicle.id, branchId: mainBranch.id, requestedById: users.admin.id,
                  approvedByEvpId: status === 'pending_fuel_allocation_approval' ? undefined : users.evp_operations.id,
                  liters: 20, fuelType: 'diesel', date: new Date('2026-06-02'),
                  purpose: `Official business ${i + 1}`, tripTo: `Destination ${i + 1}`,
                  status: status === 'pending_fuel_allocation_approval' ? 'pending' : 'approved'
                }
              }
            : undefined
        }
      });
    }
  }

  // Job orders — one per active stage, with spare parts on the noted+ ones
  if ((await prisma.jobOrder.count()) === 0) {
    const joStatuses = ['pending', 'assigned_mechanic', 'ongoing_repair'] as const;
    for (const [i, status] of joStatuses.entries()) {
      await prisma.jobOrder.create({
        data: {
          vehicleId: vehicles[3].id, branchId: mainBranch.id, status,
          incidentDate: new Date('2026-06-10'), incidentDetails: `Brake issue ${i + 1}`,
          requestedById: users.requester.id,
          notedById: status === 'pending' ? undefined : users.admin.id,
          assignedMechanicId: status === 'pending' ? undefined : drivers[4].id,
          dateOfRequest: status === 'pending' ? undefined : new Date('2026-06-11'),
          targetDate: status === 'pending' ? undefined : new Date('2026-06-25'),
          approvedById: status === 'ongoing_repair' ? users.evp_operations.id : undefined,
          dateApproved: status === 'ongoing_repair' ? new Date('2026-06-12') : undefined,
          spareParts: status === 'pending' ? undefined : { create: [{ sparePartId: parts[2].id, quantity: 2 }] }
        }
      });
    }
  }

  // GPS points — ~50 along a line for 2 vehicles
  if ((await prisma.gpsData.count()) === 0) {
    const base = { lat: 14.5995, lng: 120.9842 };
    const rows = [];
    for (const [v, vehicle] of [vehicles[2], vehicles[0]].entries()) {
      for (let i = 0; i < 25; i++) {
        rows.push({
          vehicleId: vehicle.id,
          latitude: base.lat + v * 0.01 + i * 0.0005,
          longitude: base.lng + i * 0.0007,
          speed: 30 + (i % 20), heading: 90, engineStatus: 'on',
          createdAt: new Date(Date.parse('2026-07-01T08:00:00Z') + i * 60_000)
        });
      }
    }
    await prisma.gpsData.createMany({ data: rows });
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
