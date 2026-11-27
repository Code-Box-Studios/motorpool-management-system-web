import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Audit-only model: all Prisma operations below are memory functions. No
// database client or environment setup is imported, and no network is used.
const h = vi.hoisted(() => {
  const state: any = {};
  const prisma: any = {
    $queryRaw: vi.fn(async () => []),
    jobOrder: {
      findUnique: vi.fn(async () =>
        state.order ? { ...state.order, spareParts: [] } : null
      ),
      findFirst: vi.fn(async () =>
        state.order &&
        ['assigned_mechanic', 'ongoing_repair'].includes(state.order.status)
          ? { id: state.order.id }
          : null
      ),
      count: vi.fn(async () =>
        state.order &&
        ['assigned_mechanic', 'ongoing_repair'].includes(state.order.status)
          ? 1
          : 0
      ),
      delete: vi.fn(async () => {
        state.order = null;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (!state.order || state.order.status !== where.status)
          return { count: 0 };
        Object.assign(state.order, data);
        return { count: 1 };
      })
    },
    vehicle: {
      findUnique: vi.fn(async () => ({ ...state.vehicle })),
      findUniqueOrThrow: vi.fn(async () => ({ ...state.vehicle })),
      update: vi.fn(async ({ data }: any) => {
        Object.assign(state.vehicle, data);
        return { ...state.vehicle };
      }),
      count: vi.fn(async () => 0)
    },
    vehicleStatusAudit: {
      create: vi.fn(async ({ data }: any) => {
        state.audits.push(data);
        return data;
      })
    },
    maintenance: {
      create: vi.fn(async ({ data }: any) => {
        state.maintenance.push(data);
        return data;
      })
    },
    branch: {
      findUnique: vi.fn(async () => ({ ...state.branch })),
      update: vi.fn(async ({ data }: any) => {
        Object.assign(state.branch, data);
        return { ...state.branch };
      })
    },
    driver: {
      findUnique: vi.fn(async () => ({ ...state.driver })),
      update: vi.fn(async ({ data }: any) => {
        Object.assign(state.driver, data);
        return { ...state.driver };
      }),
      count: vi.fn(async () => (state.driver.status === 'inactive' ? 0 : 1))
    },
    user: {
      count: vi.fn(async () => 0),
      findUnique: vi.fn(async () => ({ ...state.user })),
      update: vi.fn(async ({ data }: any) => {
        Object.assign(
          state.user,
          Object.fromEntries(
            Object.entries(data).filter(([, v]) => v !== undefined)
          )
        );
        return { ...state.user };
      })
    },
    refreshToken: { updateMany: vi.fn(async () => ({ count: 1 })) },
    departmentOffice: { count: vi.fn(async () => 0) },
    officeHead: { count: vi.fn(async () => 0) },
    employee: { count: vi.fn(async () => 0) },
    tripTicket: { count: vi.fn(async () => 0) },
    tripDate: { findFirst: vi.fn(async () => null) },
    sparePart: {},
    toolBorrow: {
      count: vi.fn(
        async ({ where }: any) =>
          state.borrows.filter(
            (b: any) =>
              b.returnedAt === null &&
              (!where.dueAt || b.dueAt < where.dueAt.lt)
          ).length
      ),
      findMany: vi.fn(async ({ where }: any) =>
        state.borrows.filter((b: any) => b.borrowedAt >= where.borrowedAt.gte)
      )
    }
  };
  prisma.$transaction = vi.fn(async (work: any) => work(prisma));
  return { state, prisma };
});

vi.mock('../../lib/prisma.js', () => ({ prisma: h.prisma }));
vi.mock('../../modules/notifications/events.js', () => ({
  jobOrderSubmitted: vi.fn(),
  jobOrderCompleted: vi.fn(),
  jobOrderNoted: vi.fn(),
  jobOrderApproved: vi.fn()
}));
vi.mock('../../lib/uploads.js', () => ({ publicUploadPath: vi.fn() }));

import * as jobs from '../../modules/job-orders/service.js';
import * as transitions from '../../modules/job-orders/transitions.js';
import * as users from '../../modules/users/service.js';
import * as drivers from '../../modules/drivers/service.js';
import * as toolsController from '../../modules/tools/controller.js';
import {
  completeRepairBodySchema,
  updateJobOrderBodySchema
} from '@mms/shared';

const actor = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'audit@example.invalid',
  role: 'admin'
} as any;
beforeEach(() => {
  vi.clearAllMocks();
  h.state.order = {
    id: 'job',
    status: 'pending',
    vehicleId: 'vehicle',
    branchId: 'branch',
    spareParts: []
  };
  h.state.vehicle = {
    id: 'vehicle',
    status: 'under_maintenance',
    mileage: 1200,
    images: []
  };
  h.state.branch = { id: 'branch', name: 'Audit branch', archivedAt: null };
  h.state.driver = { id: 'driver', status: 'inactive', branchId: 'branch' };
  h.state.user = {
    id: 'user',
    email: 'fixture@example.invalid',
    status: 'inactive',
    branchId: 'branch',
    createdAt: new Date(),
    userRole: null
  };
  h.state.audits = [];
  h.state.maintenance = [];
  h.state.borrows = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Operations audit invariants', () => {
  it('OPS-01 preserves an independent maintenance hold when deleting a never-noted request', async () => {
    await jobs.remove('job');
    expect(h.state.order).toBeNull();
    expect(h.state.vehicle.status).toBe('under_maintenance');
    expect(h.state.audits).toEqual([]);
  });

  it('releases the last noted repair hold when its request is deleted', async () => {
    h.state.order.status = 'assigned_mechanic';
    await jobs.remove('job');
    expect(h.state.vehicle.status).toBe('available');
    expect(h.state.audits).toHaveLength(1);
  });

  it('reactivates a driver with an active effective branch', async () => {
    await drivers.update('driver', { status: 'active' });
    expect(h.state.driver.status).toBe('active');
  });

  it('reactivates a user with an active effective branch', async () => {
    await users.update('user', { status: 'active' }, null);
    expect(h.state.user.status).toBe('active');
  });

  it('permits inactive profile edits on an archived branch without reactivation', async () => {
    h.state.branch.archivedAt = new Date();
    await drivers.update('driver', { fullName: 'Updated inactive driver' });
    await users.update('user', { fullName: 'Updated inactive user' }, null);
    expect(h.state.driver.status).toBe('inactive');
    expect(h.state.user.status).toBe('inactive');
  });

  it('OPS-03 refuses driver reactivation in its effective archived branch', async () => {
    h.state.branch.archivedAt = new Date();
    await expect(
      drivers.update('driver', { status: 'active' })
    ).rejects.toMatchObject({ code: 'PARENT_ARCHIVED', statusCode: 409 });
    expect(h.state.driver.status).toBe('inactive');
  });

  it('OPS-03 refuses user reactivation in its effective archived branch', async () => {
    h.state.branch.archivedAt = new Date();
    await expect(
      users.update('user', { status: 'active' }, null)
    ).rejects.toMatchObject({ code: 'PARENT_ARCHIVED', statusCode: 409 });
    expect(h.state.user.status).toBe('inactive');
  });

  it('OPS-04 lets a pending request be rescheduled to a later month', async () => {
    const future = new Date('2099-11-13T00:00:00Z');
    const body = updateJobOrderBodySchema.parse({ incidentDate: future });
    await jobs.update('job', body);
    expect(h.state.order.incidentDate).toEqual(future);
  });

  it('accepts an actual release at the current instant', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
    h.state.order.status = 'ongoing_repair';
    await transitions.completeRepair('job', actor, {
      actualDateOfRelease: new Date(),
      completedMileage: 1200,
      repairDone: 'simple'
    });
    expect(h.state.order.status).toBe('repaired');
    expect(h.state.maintenance).toHaveLength(1);
  });

  it('OPS-05 rejects future actual release before completing or releasing a vehicle', async () => {
    h.state.order.status = 'ongoing_repair';
    const body = completeRepairBodySchema.parse({
      actualDateOfRelease: new Date('2099-11-13T00:00:00Z'),
      completedMileage: 1200,
      repairDone: 'simple'
    });
    await expect(
      transitions.completeRepair('job', actor, body)
    ).rejects.toMatchObject({ code: 'RELEASE_IN_THE_FUTURE', statusCode: 400 });
    expect(h.state.order.status).toBe('ongoing_repair');
    expect(h.state.vehicle.status).toBe('under_maintenance');
    expect(h.state.maintenance).toEqual([]);
  });

  it('does not mark a loan overdue before the end of its Manila due day', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T15:59:59Z'));
    h.state.borrows = [
      {
        borrowedAt: new Date('2026-11-10'),
        dueAt: new Date('2026-11-13'),
        returnedAt: null,
        toolId: 'tool',
        tool: { name: 'Fixture tool' }
      }
    ];
    let response: any;
    await toolsController.stats(
      {} as any,
      {
        json: (value: any) => {
          response = value;
        }
      } as any
    );
    expect(response.overdue).toBe(0);
  });

  it('OPS-06 counts overdue loans using the Manila operating day after Manila midnight', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T17:00:00Z'));
    h.state.borrows = [
      {
        toolId: 'tool',
        tool: { name: 'Fixture tool' },
        borrowedAt: new Date('2026-11-10T00:00:00Z'),
        dueAt: new Date('2026-11-13T00:00:00Z'),
        returnedAt: null
      }
    ];
    let response: any;
    await toolsController.stats(
      {} as any,
      {
        json: (value: any) => {
          response = value;
        }
      } as any
    );
    expect(response.toolsOut).toBe(1);
    expect(response.overdue).toBe(1);
  });
});
