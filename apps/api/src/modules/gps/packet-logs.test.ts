import { randomUUID } from 'node:crypto';
import type { TrackerPacketBody } from '@mms/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
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
const endpoint = '/api/gps/packet-logs';

function packet(overrides: Partial<TrackerPacketBody> = {}): TrackerPacketBody {
  return {
    id: randomUUID(),
    revision: 0,
    receivedAt: '2026-11-06T10:00:00.123Z',
    connectionId: randomUUID(),
    peer: '127.0.0.1:12345',
    deviceId: 'unregistered-123',
    vehicleId: null,
    messageType: 'V1',
    kind: 'position',
    outcome: 'received',
    rawHex: 'ff002a48512c31323323',
    fixTime: null,
    latitude: null,
    longitude: null,
    speed: null,
    heading: null,
    ignition: null,
    reason: null,
    ...overrides
  };
}

function upload(body: TrackerPacketBody) {
  return request(app)
    .post(endpoint)
    .set('x-device-api-key', 'packet-test-key')
    .send(body);
}

async function userAuth(role = 'admin') {
  const { user } = await createTestUser({ role });
  return authHeader(user.id, user.email, role);
}

describe('tracker packet logs', () => {
  beforeEach(async () => {
    await truncateAll();
    process.env.GPS_DEVICE_API_KEY = 'packet-test-key';
  });
  afterEach(() => {
    delete process.env.GPS_DEVICE_API_KEY;
  });
  afterAll(() => prisma.$disconnect());

  it('authenticates gateway writes before validating bodies and fails closed without configuration', async () => {
    expect((await request(app).post(endpoint).send({})).status).toBe(401);
    expect(
      (
        await request(app)
          .post(endpoint)
          .set('x-device-api-key', 'wrong')
          .send({})
      ).status
    ).toBe(401);
    expect(
      (
        await request(app)
          .post(endpoint)
          .set('Authorization', await userAuth())
          .send(packet())
      ).status
    ).toBe(401);
    delete process.env.GPS_DEVICE_API_KEY;
    const missing = await upload(packet());
    expect(missing.status).toBe(500);
    expect(missing.body.error.code).toBe('GPS_NOT_CONFIGURED');
  });

  it('allows only administrator reads, including rejection of device keys and EVP users', async () => {
    expect((await request(app).get(endpoint)).status).toBe(401);
    expect(
      (
        await request(app)
          .get(endpoint)
          .set('x-device-api-key', 'packet-test-key')
      ).status
    ).toBe(401);
    expect(
      (
        await request(app)
          .get(endpoint)
          .set('Authorization', await userAuth('evp_operations'))
      ).status
    ).toBe(403);
  });

  it('preserves raw bytes, unknown/null devices, repeated packets, and database receipt time', async () => {
    const original = packet();
    const first = await upload(original);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject(original);
    expect(Number.isFinite(Date.parse(first.body.storedAt))).toBe(true);
    const duplicate = await upload(original);
    expect(duplicate.status).toBe(201);
    expect(duplicate.body).toEqual(first.body);
    expect(
      (await upload(packet({ ...original, id: randomUUID() }))).status
    ).toBe(201);
    expect(
      (await upload(packet({ deviceId: null, kind: 'fragment' }))).status
    ).toBe(201);
    const list = await request(app)
      .get(endpoint)
      .set('Authorization', await userAuth());
    expect(list.status).toBe(200);
    expect(list.body.count).toBe(3);
    expect(
      list.body.data.some((row: TrackerPacketBody) => row.deviceId === null)
    ).toBe(true);
    expect(await prisma.trackerDevice.count()).toBe(0);
  });

  it('upgrades a receipt exactly once and never regresses or replaces its final result', async () => {
    const original = packet();
    expect((await upload(original)).status).toBe(201);
    const final = {
      ...original,
      revision: 1 as const,
      outcome: 'saved' as const,
      vehicleId: randomUUID(),
      latitude: 7.1,
      longitude: 125.6,
      fixTime: '2026-11-06T09:59:00.000Z'
    };
    const saved = await upload(final);
    expect(saved.status).toBe(201);
    expect(saved.body).toMatchObject(final);
    expect((await upload(original)).body).toEqual(saved.body);
    const conflictingFinal = {
      ...final,
      outcome: 'forward_error' as const,
      vehicleId: randomUUID(),
      reason: 'retry error'
    };
    expect((await upload(conflictingFinal)).body).toEqual(saved.body);
  });

  it('accepts final-before-receipt writes and concurrent identical creations without errors', async () => {
    const original = packet();
    const final = {
      ...original,
      revision: 1 as const,
      outcome: 'invalid_fix' as const,
      latitude: 999
    };
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => upload(i % 2 ? original : final))
    );
    expect(results.map((row) => row.status)).toEqual(Array(12).fill(201));
    const listed = await request(app)
      .get(endpoint)
      .set('Authorization', await userAuth());
    expect(listed.body.count).toBe(1);
    expect(listed.body.data[0]).toMatchObject(final);
  });

  it.each([
    ['receivedAt', '2026-11-06T10:00:01.123Z'],
    ['connectionId', 'f00cfd46-a68e-4fa6-b5cb-ab875abf4c99'],
    ['peer', 'another-peer'],
    ['deviceId', 'different-tracker'],
    ['rawHex', '010203']
  ])(
    'rejects immutable %s changes even on stale retries',
    async (field, value) => {
      const original = packet({ revision: 1, outcome: 'unsupported' });
      expect((await upload(original)).status).toBe(201);
      const changed = await upload({
        ...original,
        revision: 0,
        outcome: 'received',
        [field]: value
      });
      expect(changed.status).toBe(409);
      expect(changed.body.error.code).toBe('PACKET_IDENTITY_CONFLICT');
    }
  );

  it('makes simultaneous conflicting identities produce one success and one conflict', async () => {
    const original = packet();
    const results = await Promise.all([
      upload(original),
      upload({ ...original, deviceId: 'other' })
    ]);
    expect(results.map((row) => row.status).sort()).toEqual([201, 409]);
  });

  it('keeps registry snapshots after reassignment/deletion and never touches GPS or liveness', async () => {
    const branch = await createTestBranch();
    const vehicle = await createTestVehicle(branch.id);
    const tracker = await prisma.trackerDevice.create({
      data: { imei: 'known-device', vehicleId: vehicle.id }
    });
    const before = await prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicle.id }
    });
    const body = packet({
      deviceId: tracker.imei,
      vehicleId: vehicle.id,
      revision: 1,
      outcome: 'saved',
      latitude: 7,
      longitude: 125
    });
    expect((await upload(body)).status).toBe(201);
    expect(await prisma.gpsData.count()).toBe(0);
    expect(
      (
        await prisma.trackerDevice.findUniqueOrThrow({
          where: { id: tracker.id }
        })
      ).lastSeenAt
    ).toBeNull();
    expect(
      await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })
    ).toEqual(before);
    await prisma.trackerDevice.update({
      where: { id: tracker.id },
      data: { vehicleId: null }
    });
    await prisma.trackerDevice.delete({ where: { id: tracker.id } });
    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    const list = await request(app)
      .get(endpoint)
      .query({ deviceId: tracker.imei })
      .set('Authorization', await userAuth());
    expect(list.body.data[0]).toMatchObject(body);
  });

  it('filters exact/partial identity, kind/outcome, and inclusive receipt time while counting all matches', async () => {
    const auth = await userAuth();
    for (const body of [
      packet({
        deviceId: 'abc-123',
        revision: 1,
        outcome: 'saved',
        receivedAt: '2026-11-06T09:00:00.000Z'
      }),
      packet({
        deviceId: 'abc-123',
        revision: 1,
        outcome: 'invalid_fix',
        receivedAt: '2026-11-06T10:00:00.000Z'
      }),
      packet({
        deviceId: 'abc-1234',
        revision: 1,
        outcome: 'heartbeat',
        kind: 'heartbeat'
      }),
      packet({ deviceId: null, kind: 'fragment' })
    ])
      expect((await upload(body)).status).toBe(201);
    const list = (query: Record<string, string | number>) =>
      request(app).get(endpoint).query(query).set('Authorization', auth);
    expect((await list({ deviceId: 'abc-123', limit: 1 })).body.count).toBe(2);
    expect((await list({ search: 'abc-12' })).body.count).toBe(3);
    expect(
      (
        await list({
          deviceId: 'abc-123',
          outcome: 'saved',
          kind: 'position',
          from: '2026-11-06T09:00:00Z',
          to: '2026-11-06T09:00:00Z'
        })
      ).body.count
    ).toBe(1);
    expect((await list({ kind: 'fragment' })).body.count).toBe(1);
  });

  it('uses receivedAt/id keyset pages stable under new inserts and missing cursor rows', async () => {
    const auth = await userAuth();
    const ids = [1, 2, 3, 4].map(
      (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
    );
    for (const id of ids)
      expect((await upload(packet({ id }))).status).toBe(201);
    const first = await request(app)
      .get(endpoint)
      .query({ limit: 2 })
      .set('Authorization', auth);
    expect(first.body.data.map((row: TrackerPacketBody) => row.id)).toEqual([
      ids[3],
      ids[2]
    ]);
    expect(first.body.count).toBe(4);
    expect(first.body.nextCursor).toBeTypeOf('string');
    expect(
      (await upload(packet({ receivedAt: '2026-11-06T11:00:00.000Z' }))).status
    ).toBe(201);
    await prisma.trackerPacketLog.delete({ where: { id: ids[2] } });
    const second = await request(app)
      .get(endpoint)
      .query({ limit: 2, cursor: first.body.nextCursor })
      .set('Authorization', auth);
    expect(second.status).toBe(200);
    expect(second.body.data.map((row: TrackerPacketBody) => row.id)).toEqual([
      ids[1],
      ids[0]
    ]);
    expect(second.body.count).toBe(4);
    expect(second.body.nextCursor).toBeNull();
  });

  it.each(['peer', 'deviceId', 'messageType', 'reason'])(
    'rejects embedded NUL in %s with HTTP400 before inserting',
    async (field) => {
      const result = await upload(packet({ [field]: 'before\u0000after' }));
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe('VALIDATION_ERROR');
      expect(await prisma.trackerPacketLog.count()).toBe(0);
    }
  );

  it.each(['deviceId', 'search'])(
    'rejects embedded NUL in %s query filters with HTTP400',
    async (field) => {
      const result = await request(app)
        .get(endpoint)
        .query({ [field]: 'before\u0000after' })
        .set('Authorization', await userAuth());
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe('VALIDATION_ERROR');
    }
  );

  it('validates upload bounds, timestamp ranges, and independent cursors', async () => {
    expect((await upload(packet({ rawHex: '00'.repeat(8193) }))).status).toBe(
      400
    );
    expect(
      (await upload(packet({ revision: 0, outcome: 'saved' }))).status
    ).toBe(400);
    const auth = await userAuth();
    for (const query of [
      { limit: 101 },
      { cursor: 'garbage' },
      { from: '2026-11-06T10:00:00Z', to: '2026-11-06T09:00:00Z' }
    ]) {
      expect(
        (
          await request(app)
            .get(endpoint)
            .query(query)
            .set('Authorization', auth)
        ).status
      ).toBe(400);
    }
  });
});
