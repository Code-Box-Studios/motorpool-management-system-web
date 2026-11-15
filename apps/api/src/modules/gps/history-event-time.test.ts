import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { truncateAll } from '../../test/db.js';
import {
  authHeader,
  createTestBranch,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';

const app = createApp();
describe('GPS history measurement-time contract', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  async function fixture() {
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id);
    const { user } = await createTestUser();
    const auth = authHeader(user.id, user.email, 'admin');
    return {
      vehicle,
      point: (
        id: number,
        fixTime: string | null,
        createdAt: string,
        vehicleId = vehicle.id
      ) =>
        prisma.gpsData.create({
          data: {
            id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
            vehicleId,
            fixTime: fixTime ? new Date(fixTime) : null,
            createdAt: new Date(createdAt),
            latitude: 7,
            longitude: 125
          }
        }),
      history: (query: Record<string, string | number> = {}) =>
        request(app)
          .get('/api/gps/history')
          .query({ vehicleId: vehicle.id, ...query })
          .set('Authorization', auth)
    };
  }

  it('includes delayed measurements in their real period and retains receipt fallback only for legacy rows', async () => {
    const s = await fixture();
    const delayed = await s.point(
      1,
      '2026-11-06T08:01:00Z',
      '2026-11-06T11:00:00Z'
    );
    const legacy = await s.point(2, null, '2026-11-06T08:02:00Z');
    await s.point(3, '2026-11-06T05:00:00Z', '2026-11-06T08:01:00Z');
    const response = await s.history({
      from: '2026-11-06T08:00:00Z',
      to: '2026-11-06T08:03:00Z'
    });
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);
    expect(response.body.data.map((p: { id: string }) => p.id)).toEqual([
      legacy.id,
      delayed.id
    ]);
    const receipt = await s.history({
      from: '2026-11-06T10:59:00Z',
      to: '2026-11-06T11:01:00Z'
    });
    expect(receipt.body.count).toBe(0);
    expect(receipt.body.data).toEqual([]);
  });

  it('pages mixed event and legacy timestamps by event, receipt and UUID without missing or duplicating points', async () => {
    const s = await fixture();
    const a = await s.point(1, '2026-11-06T08:00:00Z', '2026-11-06T11:00:00Z');
    const b = await s.point(2, '2026-11-06T08:01:00Z', '2026-11-06T09:00:00Z');
    const c = await s.point(3, null, '2026-11-06T08:02:00Z');
    const d = await s.point(4, '2026-11-06T08:01:00Z', '2026-11-06T09:00:00Z');
    const first = await s.history({ limit: 2 });
    expect(first.body.count).toBe(4);
    expect(first.body.data.map((p: { id: string }) => p.id)).toEqual([
      c.id,
      d.id
    ]);
    expect(first.body.nextCursor).toBe(d.id);
    const second = await s.history({ limit: 2, cursor: first.body.nextCursor });
    expect(second.body.data.map((p: { id: string }) => p.id)).toEqual([
      b.id,
      a.id
    ]);
    expect(second.body.nextCursor).toBeNull();
  });

  it('does not let a cursor from another vehicle skip a matching journey', async () => {
    const s = await fixture();
    const branch = await createTestBranch('Other branch');
    const other = await createTestVehicle(branch.id, {
      licensePlate: 'OTHER',
      vin: 'OTHER'
    });
    const own = await s.point(
      1,
      '2026-11-06T08:00:00Z',
      '2026-11-06T11:00:00Z'
    );
    const foreign = await s.point(
      2,
      '2026-11-06T08:01:00Z',
      '2026-11-06T12:00:00Z',
      other.id
    );
    const response = await s.history({ limit: 1, cursor: foreign.id });
    expect(response.body.count).toBe(1);
    expect(response.body.data).toEqual([]);
    expect(response.body.nextCursor).toBeNull();
    expect((await s.history()).body.data[0].id).toBe(own.id);
  });
});
