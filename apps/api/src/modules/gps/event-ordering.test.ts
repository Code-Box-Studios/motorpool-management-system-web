import { randomUUID } from 'node:crypto';
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
async function fixture() {
  const branch = await createTestBranch();
  const vehicle = await createTestVehicle(branch.id);
  const tracker = await prisma.trackerDevice.create({
    data: {
      imei: 'event-ordering',
      vehicleId: vehicle.id,
      lastSeenAt: new Date()
    }
  });
  const { user } = await createTestUser({ role: 'admin' });
  const auth = authHeader(user.id, user.email, 'admin');
  const send = (body: Record<string, unknown>) =>
    request(app)
      .post('/api/gps/ingest')
      .set('x-device-api-key', 'event-key')
      .send({ vehicleId: vehicle.id, longitude: 125.6, ...body });
  return { vehicle, tracker, auth, send };
}

describe('GPS event-time invariants', () => {
  beforeEach(async () => {
    await truncateAll();
    process.env.GPS_DEVICE_API_KEY = 'event-key';
  });
  afterEach(() => {
    delete process.env.GPS_DEVICE_API_KEY;
  });
  afterAll(() => prisma.$disconnect());

  it('GPS-02 keeps a delayed older fix in history without replacing current coordinates or latest', async () => {
    const s = await fixture();
    const newer = new Date(Date.now() - 60_000).toISOString();
    const older = new Date(Date.now() - 120_000).toISOString();
    expect((await s.send({ latitude: 7.1, fixTime: newer })).status).toBe(201);
    expect((await s.send({ latitude: 7.0, fixTime: older })).status).toBe(201);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } }))
        .latitude
    ).toBe(7.1);
    const latest = await request(app)
      .get('/api/gps/latest')
      .set('Authorization', s.auth);
    expect(latest.body.data[0]).toMatchObject({
      latitude: 7.1,
      fixTime: newer
    });
    expect(Date.parse(latest.body.data[0].lastContactAt)).toBeGreaterThan(
      Date.parse(newer)
    );
    const history = await request(app)
      .get('/api/gps/history')
      .query({ vehicleId: s.vehicle.id })
      .set('Authorization', s.auth);
    expect(history.body.count).toBe(2);
    expect(
      history.body.data.map((p: { fixTime: string }) => p.fixTime).sort()
    ).toEqual([older, newer]);
  });

  it('GPS-02 serializes concurrent direct integrations so the newest event wins', async () => {
    const s = await fixture();
    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        s.send({
          latitude: i,
          fixTime: new Date(Date.now() - (i + 1) * 60_000).toISOString()
        })
      )
    );
    expect(responses.every((r) => r.status === 201)).toBe(true);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: s.vehicle.id } }))
        .latitude
    ).toBe(0);
    expect(await prisma.gpsData.count()).toBe(12);
  });

  it('GPS-02 rejects future event instants instead of poisoning current position ordering', async () => {
    const s = await fixture();
    const response = await s.send({
      latitude: 7.1,
      fixTime: '2099-01-01T00:00:00Z'
    });
    expect(response.status).toBe(400);
    expect(await prisma.gpsData.count()).toBe(0);
  });

  it('GPS-02 uses packet receipt time when a tracker has no fix time, preserving receipt identity', async () => {
    const s = await fixture();
    const receipt = {
      id: randomUUID(),
      revision: 0,
      receivedAt: new Date(Date.now() - 120_000).toISOString(),
      connectionId: randomUUID(),
      peer: '127.0.0.1',
      deviceId: s.tracker.imei,
      vehicleId: null,
      messageType: 'V1',
      kind: 'position',
      outcome: 'received',
      rawHex: '2a485123',
      fixTime: null,
      latitude: 7.1,
      longitude: 125.6,
      speed: null,
      heading: null,
      ignition: null,
      reason: null
    };
    const result = await s.send({
      deviceId: s.tracker.imei,
      protocol: 'h02',
      latitude: 7.1,
      packet: receipt
    });
    expect(result.status).toBe(201);
    const history = await request(app)
      .get('/api/gps/history')
      .query({ vehicleId: s.vehicle.id })
      .set('Authorization', s.auth);
    expect(history.body.data[0]).toMatchObject({
      id: receipt.id,
      fixTime: receipt.receivedAt
    });
    expect(Date.parse(history.body.data[0].createdAt)).toBeGreaterThan(
      Date.parse(receipt.receivedAt)
    );
    expect(
      (
        await s.send({
          deviceId: s.tracker.imei,
          protocol: 'h02',
          latitude: 7.1,
          packet: receipt
        })
      ).body.gpsId
    ).toBe(receipt.id);
    expect(await prisma.gpsData.count()).toBe(1);
  });
});
