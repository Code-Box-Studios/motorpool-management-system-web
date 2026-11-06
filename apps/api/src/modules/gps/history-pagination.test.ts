import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestBranch, createTestUser, createTestVehicle } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();
describe('GPS route history pagination', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('pages all reports with a stable cursor even when their timestamps match', async () => {
    const { user } = await createTestUser();
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id);
    const time = new Date('2026-11-06T08:00:00Z');
    const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'];
    for (const id of ids) await prisma.gpsData.create({ data: { id, vehicleId: vehicle.id, latitude: 1, longitude: 120, createdAt: time } });
    const headers = authHeader(user.id, user.email, 'admin');
    const first = await request(app).get('/api/gps/history').query({ vehicleId: vehicle.id, limit: 2 }).set('Authorization', headers);
    expect(first.status).toBe(200);
    expect(first.body.count).toBe(3);
    expect(first.body.data.map((p: { id: string }) => p.id)).toEqual([ids[2], ids[1]]);
    expect(first.body.nextCursor).toBe(ids[1]);
    const second = await request(app).get('/api/gps/history').query({ vehicleId: vehicle.id, limit: 2, cursor: first.body.nextCursor }).set('Authorization', headers);
    expect(second.status).toBe(200);
    expect(second.body.data.map((p: { id: string }) => p.id)).toEqual([ids[0]]);
    expect(second.body.nextCursor).toBeNull();
    expect(second.body.count).toBe(3);
  });

  it('keeps cursor pages scoped to the selected vehicle and requested dates', async () => {
    const { user } = await createTestUser();
    const branch = await createTestBranch();
    const firstVehicle = await createTestVehicle(branch.id);
    const other = await createTestVehicle(branch.id, { licensePlate: 'OTHER', vin: 'OTHER-VIN' });
    for (const [vehicleId, date] of [[firstVehicle.id, '2026-11-06T08:00:00Z'], [firstVehicle.id, '2026-11-06T08:01:00Z'], [firstVehicle.id, '2026-11-06T07:00:00Z'], [other.id, '2026-11-06T08:00:30Z']] as const) await prisma.gpsData.create({ data: { vehicleId, latitude: 1, longitude: 120, createdAt: new Date(date) } });
    const headers = authHeader(user.id, user.email, 'admin');
    const query = { vehicleId: firstVehicle.id, from: '2026-11-06T08:00:00Z', to: '2026-11-06T08:02:00Z', limit: 1 };
    const first = await request(app).get('/api/gps/history').query(query).set('Authorization', headers);
    expect(first.body.count).toBe(2);
    expect(first.body.nextCursor).toBe(first.body.data[0].id);
    const second = await request(app).get('/api/gps/history').query({ ...query, cursor: first.body.nextCursor }).set('Authorization', headers);
    expect(second.body.data).toHaveLength(1);
    expect(second.body.data[0].vehicleId).toBe(firstVehicle.id);
    expect(second.body.data[0].createdAt).toBe('2026-11-06T08:00:00.000Z');
    expect(second.body.nextCursor).toBeNull();
  });
});
