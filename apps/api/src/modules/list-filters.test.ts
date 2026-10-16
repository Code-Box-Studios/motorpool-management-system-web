import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { truncateAll } from '../test/db.js';
import {
  authHeader,
  createTestBranch,
  createTestDriver,
  createTestTicket,
  createTestUser,
  createTestVehicle
} from '../test/factories.js';

const app = createApp();
type Query = Record<string, string | number>;

async function expectList(
  endpoint: string,
  header: string,
  query: Query,
  ids: string[],
  count = ids.length
) {
  const response = await request(app)
    .get(`/api/${endpoint}`)
    .query(query)
    .set('Authorization', header);
  expect(response.status, `${endpoint} ${JSON.stringify(query)}`).toBe(200);
  expect(response.body.count, endpoint).toBe(count);
  expect(
    response.body.data.map((row: { id: string }) => row.id).sort(),
    endpoint
  ).toEqual([...ids].sort());
}

async function adminHeader() {
  const { user } = await createTestUser();
  return authHeader(user.id, user.email, 'admin');
}

describe('record list column filters', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('filters driver status before search, paging, and count', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const rows = [];
    for (const [index, status] of (
      ['active', 'inactive', 'active', 'on_trip'] as const
    ).entries()) {
      const row = await prisma.driver.create({
        data: {
          branchId: branch.id,
          email: `driver-${index}@test.local`,
          fullName: `Needle ${index}`,
          status
        }
      });
      rows.push(row);
    }
    await expectList(
      'drivers',
      header,
      {},
      rows.map((row) => row.id)
    );
    await expectList('drivers', header, { status: 'inactive' }, [rows[1]!.id]);
    await expectList('drivers', header, { status: 'on_trip' }, [rows[3]!.id]);
    await expectList(
      'drivers',
      header,
      {
        status: 'active',
        search: 'needle',
        page: 2,
        limit: 1,
        sortBy: 'fullName',
        sortOrder: 'asc'
      },
      [rows[2]!.id],
      2
    );
    await expectList(
      'drivers',
      header,
      { status: 'inactive', search: 'Needle 0' },
      []
    );
  });

  it('intersects vehicle status, fuel type, branch, and search before paging', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch('North');
    const otherBranch = await createTestBranch('South');
    const rows = [];
    const variants = [
      { status: 'available', fuelType: 'diesel', branchId: branch.id },
      { status: 'unavailable', fuelType: 'diesel', branchId: branch.id },
      { status: 'available', fuelType: 'gasoline', branchId: branch.id },
      { status: 'available', fuelType: 'diesel', branchId: otherBranch.id },
      { status: 'available', fuelType: 'diesel', branchId: branch.id }
    ] as const;
    for (const [index, variant] of variants.entries()) {
      const vehicle = await createTestVehicle(variant.branchId, {
        licensePlate: `NEEDLE-${index}`,
        vin: `FILTER-VIN-${index}`
      });
      rows.push(
        await prisma.vehicle.update({
          where: { id: vehicle.id },
          data: variant
        })
      );
    }
    await expectList(
      'vehicles',
      header,
      {},
      rows.map((row) => row.id)
    );
    await expectList('vehicles', header, { status: 'unavailable' }, [
      rows[1]!.id
    ]);
    await expectList('vehicles', header, { fuelType: 'gasoline' }, [
      rows[2]!.id
    ]);
    await expectList('vehicles', header, { branchId: otherBranch.id }, [
      rows[3]!.id
    ]);
    await expectList(
      'vehicles',
      header,
      {
        status: 'available',
        fuelType: 'diesel',
        branchId: branch.id,
        search: 'needle',
        sortBy: 'licensePlate',
        sortOrder: 'asc',
        page: 2,
        limit: 1
      },
      [rows[4]!.id],
      2
    );
    await expectList(
      'vehicles',
      header,
      { status: 'unavailable', fuelType: 'gasoline' },
      []
    );
  });

  it('uses disjoint stock bands with inclusive low-stock boundary of five', async () => {
    const header = await adminHeader();
    const rows = [];
    for (const quantity of [0, 1, 5, 6]) {
      rows.push(
        await prisma.sparePart.create({
          data: { name: `Needle ${quantity}`, quantity }
        })
      );
    }
    await expectList(
      'spare-parts',
      header,
      {},
      rows.map((row) => row.id)
    );
    await expectList(
      'spare-parts',
      header,
      { stock: 'out_of_stock', search: 'needle' },
      [rows[0]!.id]
    );
    await expectList(
      'spare-parts',
      header,
      { stock: 'in_stock', search: 'needle' },
      [rows[3]!.id]
    );
    await expectList(
      'spare-parts',
      header,
      {
        stock: 'low_stock',
        search: 'needle',
        sortBy: 'quantity',
        sortOrder: 'asc',
        page: 2,
        limit: 1
      },
      [rows[2]!.id],
      2
    );
    await expectList(
      'spare-parts',
      header,
      { stock: 'out_of_stock', search: 'Needle 6' },
      []
    );
  });

  it('filters each tool status and combines status with search and paging', async () => {
    const header = await adminHeader();
    const rows = [];
    for (const [index, status] of (
      [
        'available',
        'borrowed',
        'under_maintenance',
        'out_of_service',
        'available'
      ] as const
    ).entries()) {
      rows.push(
        await prisma.tool.create({ data: { name: `Needle ${index}`, status } })
      );
    }
    await expectList(
      'tools',
      header,
      {},
      rows.map((row) => row.id)
    );
    for (const index of [1, 2, 3]) {
      await expectList('tools', header, { status: rows[index]!.status }, [
        rows[index]!.id
      ]);
    }
    await expectList(
      'tools',
      header,
      {
        status: 'available',
        search: 'needle',
        sortBy: 'name',
        sortOrder: 'asc',
        page: 2,
        limit: 1
      },
      [rows[4]!.id],
      2
    );
  });

  it('intersects user status, existing role, branch, and search', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch('North');
    const otherBranch = await createTestBranch('South');
    const variants = [
      { status: 'active', role: 'requester', branchId: branch.id },
      { status: 'inactive', role: 'requester', branchId: branch.id },
      { status: 'active', role: 'driver', branchId: branch.id },
      { status: 'active', role: 'requester', branchId: otherBranch.id },
      { status: 'active', role: 'requester', branchId: branch.id }
    ] as const;
    const ids = [];
    for (const [index, variant] of variants.entries()) {
      const { user } = await createTestUser({
        ...variant,
        email: `user-${index}@test.local`,
        fullName: `Needle ${index}`
      });
      ids.push(user.id);
    }
    await expectList('users', header, { search: 'needle' }, ids);
    await expectList('users', header, { status: 'inactive' }, [ids[1]!]);
    await expectList('users', header, { role: 'driver' }, [ids[2]!]);
    await expectList('users', header, { branchId: otherBranch.id }, [ids[3]!]);
    await expectList(
      'users',
      header,
      {
        status: 'active',
        role: 'requester',
        branchId: branch.id,
        search: 'needle',
        sortBy: 'fullName',
        sortOrder: 'asc',
        page: 2,
        limit: 1
      },
      [ids[4]!],
      2
    );
    await expectList(
      'users',
      header,
      { status: 'inactive', role: 'driver' },
      []
    );
  });

  it('intersects tracker assignment, status, vehicle, and search', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id);
    const otherVehicle = await createTestVehicle(branch.id, {
      licensePlate: 'OTHER',
      vin: 'OTHER'
    });
    const variants = [
      { status: 'active', vehicleId: null },
      { status: 'active', vehicleId: vehicle.id },
      { status: 'inactive', vehicleId: otherVehicle.id },
      { status: 'decommissioned', vehicleId: null },
      { status: 'active', vehicleId: null }
    ] as const;
    const rows = [];
    for (const [index, variant] of variants.entries()) {
      rows.push(
        await prisma.trackerDevice.create({
          data: {
            ...variant,
            imei: `12345678901234${index}`,
            label: `Needle ${index}`
          }
        })
      );
    }
    await expectList(
      'tracker-devices',
      header,
      {},
      rows.map((row) => row.id)
    );
    await expectList('tracker-devices', header, { assignment: 'assigned' }, [
      rows[1]!.id,
      rows[2]!.id
    ]);
    await expectList('tracker-devices', header, { assignment: 'unassigned' }, [
      rows[0]!.id,
      rows[3]!.id,
      rows[4]!.id
    ]);
    await expectList('tracker-devices', header, { status: 'inactive' }, [
      rows[2]!.id
    ]);
    await expectList(
      'tracker-devices',
      header,
      { assignment: 'assigned', vehicleId: vehicle.id },
      [rows[1]!.id]
    );
    await expectList(
      'tracker-devices',
      header,
      { assignment: 'unassigned', vehicleId: vehicle.id },
      []
    );
    await expectList(
      'tracker-devices',
      header,
      {
        assignment: 'unassigned',
        status: 'active',
        search: 'needle',
        sortBy: 'label',
        sortOrder: 'asc',
        page: 2,
        limit: 1
      },
      [rows[4]!.id],
      2
    );
  });

  it('intersects job-order repair classification, status, and numeric reference search', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id);
    const variants = [
      { status: 'repaired', repairDone: 'simple', orderNo: 123 },
      { status: 'repaired', repairDone: 'complex', orderNo: 234 },
      { status: 'repaired', repairDone: 'compound', orderNo: 345 },
      { status: 'pending', repairDone: null, orderNo: 456 },
      { status: 'ongoing_repair', repairDone: 'simple', orderNo: 523 },
      { status: 'repaired', repairDone: 'simple', orderNo: 623 }
    ] as const;
    const rows = [];
    for (const variant of variants) {
      rows.push(
        await prisma.jobOrder.create({
          data: {
            ...variant,
            branchId: branch.id,
            vehicleId: vehicle.id,
            incidentDetails: 'Needle repair'
          }
        })
      );
    }
    await expectList(
      'job-orders',
      header,
      {},
      rows.map((row) => row.id)
    );
    await expectList('job-orders', header, { repairDone: 'simple' }, [
      rows[0]!.id,
      rows[4]!.id,
      rows[5]!.id
    ]);
    await expectList('job-orders', header, { repairDone: 'complex' }, [
      rows[1]!.id
    ]);
    await expectList('job-orders', header, { repairDone: 'compound' }, [
      rows[2]!.id
    ]);
    await expectList(
      'job-orders',
      header,
      {
        repairDone: 'simple',
        status: 'repaired',
        search: '23',
        sortBy: 'orderNo',
        sortOrder: 'asc',
        page: 2,
        limit: 1
      },
      [rows[5]!.id],
      2
    );
    await expectList(
      'job-orders',
      header,
      { repairDone: 'simple', search: 'complex' },
      []
    );
  });

  it('intersects every maintenance type with vehicle and search before paging', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id);
    const otherVehicle = await createTestVehicle(branch.id, {
      licensePlate: 'OTHER',
      vin: 'OTHER'
    });
    const rows = [];
    for (const [index, type] of (
      [
        'preventive',
        'corrective',
        'inspection',
        'repair',
        'service',
        'preventive',
        'preventive'
      ] as const
    ).entries()) {
      rows.push(
        await prisma.maintenance.create({
          data: {
            vehicleId: index === 6 ? otherVehicle.id : vehicle.id,
            type,
            description: 'Needle inspection',
            date: new Date(`2026-01-0${index + 1}`)
          }
        })
      );
    }
    await expectList(
      'maintenance',
      header,
      {},
      rows.map((row) => row.id)
    );
    for (const index of [1, 2, 3, 4]) {
      await expectList('maintenance', header, { type: rows[index]!.type }, [
        rows[index]!.id
      ]);
    }
    await expectList('maintenance', header, { type: 'preventive' }, [
      rows[0]!.id,
      rows[5]!.id,
      rows[6]!.id
    ]);
    await expectList('maintenance', header, { vehicleId: otherVehicle.id }, [
      rows[6]!.id
    ]);
    await expectList(
      'maintenance',
      header,
      {
        type: 'preventive',
        vehicleId: vehicle.id,
        search: 'needle',
        sortBy: 'date',
        sortOrder: 'asc',
        page: 2,
        limit: 1
      },
      [rows[5]!.id],
      2
    );
  });

  it('keeps trip-ticket status filtering functional with search and paging', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id);
    const driver = await createTestDriver(branch.id);
    const rows = [];
    for (const [index, status] of (
      [
        'approved',
        'pending_admin_approval',
        'pending_fuel_allocation_approval',
        'in_progress',
        'completed',
        'cancelled',
        'disapproved',
        'approved'
      ] as const
    ).entries()) {
      const ticket = await createTestTicket({
        branchId: branch.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        status
      });
      rows.push(
        await prisma.tripTicket.update({
          where: { id: ticket.id },
          data: { destination: `Needle ${index}` }
        })
      );
    }
    await expectList(
      'trip-tickets',
      header,
      {},
      rows.map((row) => row.id)
    );
    for (const index of [1, 2, 3, 4, 5, 6]) {
      await expectList(
        'trip-tickets',
        header,
        { status: rows[index]!.status },
        [rows[index]!.id]
      );
    }
    await expectList(
      'trip-tickets',
      header,
      {
        status: 'approved',
        search: 'needle',
        sortBy: 'destination',
        sortOrder: 'asc',
        page: 2,
        limit: 1
      },
      [rows[7]!.id],
      2
    );
  });

  it('filters recorded approval outcomes across both sources before paging and search counts', async () => {
    const { user } = await createTestUser();
    const header = authHeader(user.id, user.email, 'admin');
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id);
    const driver = await createTestDriver(branch.id);
    const allocations = [];
    // A newer approved row must not displace either older declined decision.
    for (const [index, status] of (
      [
        'disapproved',
        'disapproved',
        'approved',
        'cancelled',
        'pending'
      ] as const
    ).entries()) {
      const ticket = await createTestTicket({
        branchId: branch.id,
        vehicleId: vehicle.id,
        driverId: driver.id
      });
      await prisma.tripTicket.update({
        where: { id: ticket.id },
        data: {
          destination: `Needle ${index === 2 ? 'ExclusiveApproved' : index}`
        }
      });
      allocations.push(
        await prisma.fuelAllocation.create({
          data: {
            tripTicketId: ticket.id,
            vehicleId: vehicle.id,
            requestedById: user.id,
            liters: 20,
            fuelType: 'diesel',
            date: new Date(),
            purpose: 'Testing',
            tripTo: 'Needle',
            status,
            decidedById: user.id,
            decidedAt: new Date(`2026-01-0${index + 1}`)
          }
        })
      );
    }
    const repair = await prisma.jobOrder.create({
      data: {
        branchId: branch.id,
        vehicleId: vehicle.id,
        status: 'ongoing_repair',
        incidentDetails: 'Needle repair',
        approvedById: user.id,
        dateApproved: new Date('2026-02-01')
      }
    });
    await expectList('approvals/history', header, {}, [
      allocations[0]!.id,
      allocations[1]!.id,
      allocations[2]!.id,
      repair.id
    ]);
    await expectList(
      'approvals/history',
      header,
      { outcome: 'declined', page: 2, limit: 1 },
      [allocations[0]!.id],
      2
    );
    await expectList('approvals/history', header, { outcome: 'approved' }, [
      allocations[2]!.id,
      repair.id
    ]);
    await expectList(
      'approvals/history',
      header,
      { outcome: 'approved', page: 2, limit: 1 },
      [allocations[2]!.id],
      2
    );
    await expectList(
      'approvals/history',
      header,
      {
        kind: 'fuel',
        outcome: 'declined',
        search: 'needle',
        page: 2,
        limit: 1
      },
      [allocations[0]!.id],
      2
    );
    await expectList(
      'approvals/history',
      header,
      { kind: 'repair', outcome: 'approved' },
      [repair.id]
    );
    await expectList(
      'approvals/history',
      header,
      { kind: 'repair', outcome: 'declined' },
      []
    );
    await expectList(
      'approvals/history',
      header,
      { kind: 'fuel', outcome: 'declined', search: 'ExclusiveApproved' },
      []
    );
    const forbidden = await request(app)
      .get('/api/approvals/history')
      .query({ outcome: 'approved' })
      .set('Authorization', authHeader(user.id, user.email, 'requester'));
    expect(forbidden.status).toBe(403);
  });

  it('binds driver status filters to the caller personnel row', async () => {
    const branch = await createTestBranch();
    const { user } = await createTestUser({ role: 'driver' });
    const own = await createTestDriver(branch.id, 'active', user.email);
    await prisma.driver.update({
      where: { id: own.id },
      data: { userId: user.id }
    });
    await createTestDriver(branch.id, 'inactive', 'hidden@test.local');
    const header = authHeader(user.id, user.email, 'driver');
    await expectList('drivers', header, { status: 'active', search: 'Guard' }, [
      own.id
    ]);
    await expectList(
      'drivers',
      header,
      { status: 'inactive', search: 'Guard' },
      []
    );
  });

  it('keeps requester and assigned-mechanic job-order scopes with classification and numeric search', async () => {
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id);
    const { user: requester } = await createTestUser({ role: 'requester' });
    const { user: mechanicUser } = await createTestUser({
      role: 'driver',
      email: 'mechanic@test.local'
    });
    const mechanic = await createTestDriver(
      branch.id,
      'active',
      mechanicUser.email
    );
    await prisma.driver.update({
      where: { id: mechanic.id },
      data: { userId: mechanicUser.id }
    });
    const requested = await prisma.jobOrder.create({
      data: {
        branchId: branch.id,
        vehicleId: vehicle.id,
        requestedById: requester.id,
        status: 'repaired',
        repairDone: 'simple',
        orderNo: 123
      }
    });
    const assigned = await prisma.jobOrder.create({
      data: {
        branchId: branch.id,
        vehicleId: vehicle.id,
        assignedMechanicId: mechanic.id,
        status: 'repaired',
        repairDone: 'simple',
        orderNo: 223
      }
    });
    await prisma.jobOrder.create({
      data: {
        branchId: branch.id,
        vehicleId: vehicle.id,
        status: 'repaired',
        repairDone: 'simple',
        orderNo: 323
      }
    });
    const query = {
      status: 'repaired',
      repairDone: 'simple',
      search: '23',
      page: 1,
      limit: 1
    };
    await expectList(
      'job-orders',
      authHeader(requester.id, requester.email, 'requester'),
      query,
      [requested.id]
    );
    await expectList(
      'job-orders',
      authHeader(mechanicUser.id, mechanicUser.email, 'driver'),
      query,
      [assigned.id]
    );
  });

  it('keeps requester and driver trip-ticket scopes under conflicting client filters', async () => {
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id);
    const { user: requester } = await createTestUser({ role: 'requester' });
    const { user: driverUser } = await createTestUser({
      role: 'driver',
      email: 'driver@test.local'
    });
    const driver = await createTestDriver(
      branch.id,
      'active',
      driverUser.email
    );
    await prisma.driver.update({
      where: { id: driver.id },
      data: { userId: driverUser.id }
    });
    const otherDriver = await createTestDriver(
      branch.id,
      'active',
      'hidden@test.local'
    );
    const own = await createTestTicket({
      branchId: branch.id,
      vehicleId: vehicle.id,
      driverId: driver.id
    });
    await prisma.tripTicket.update({
      where: { id: own.id },
      data: { requestedById: requester.id }
    });
    const hidden = await createTestTicket({
      branchId: branch.id,
      vehicleId: vehicle.id,
      driverId: otherDriver.id
    });
    await prisma.tripTicket.update({
      where: { id: hidden.id },
      data: { requestedById: driverUser.id }
    });
    const query = {
      status: 'approved',
      search: 'Somewhere',
      page: 1,
      limit: 1
    };
    const requesterHeader = authHeader(
      requester.id,
      requester.email,
      'requester'
    );
    const driverHeader = authHeader(driverUser.id, driverUser.email, 'driver');
    await expectList('trip-tickets', requesterHeader, query, [own.id]);
    await expectList('trip-tickets', driverHeader, query, [own.id]);
    await expectList(
      'trip-tickets',
      requesterHeader,
      { ...query, requestedBy: driverUser.id },
      []
    );
    await expectList(
      'trip-tickets',
      driverHeader,
      { ...query, driverId: otherDriver.id },
      []
    );
  });

  it.each([
    ['drivers', 'status', 'unknown'],
    ['vehicles', 'status', 'unknown'],
    ['vehicles', 'fuelType', 'unknown'],
    ['vehicles', 'branchId', 'not-a-uuid'],
    ['spare-parts', 'stock', 'unknown'],
    ['tools', 'status', 'unknown'],
    ['users', 'status', 'unknown'],
    ['users', 'branchId', 'not-a-uuid'],
    ['tracker-devices', 'status', 'unknown'],
    ['tracker-devices', 'assignment', 'unknown'],
    ['tracker-devices', 'vehicleId', 'not-a-uuid'],
    ['job-orders', 'repairDone', 'unknown'],
    ['job-orders', 'status', 'unknown'],
    ['trip-tickets', 'status', 'unknown'],
    ['maintenance', 'type', 'unknown'],
    ['maintenance', 'vehicleId', 'not-a-uuid'],
    ['approvals/history', 'kind', 'unknown'],
    ['approvals/history', 'outcome', 'unknown']
  ])('rejects invalid %s %s filters', async (endpoint, key, value) => {
    const response = await request(app)
      .get(`/api/${endpoint}`)
      .query({ [key]: value })
      .set('Authorization', await adminHeader());
    expect(response.status).toBe(400);
  });
});
