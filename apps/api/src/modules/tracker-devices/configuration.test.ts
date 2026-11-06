import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { truncateAll } from '../../test/db.js';
import { authHeader, createTestUser } from '../../test/factories.js';
import * as repository from './repository.js';

const app = createApp();
const imei = '1234567890';
const reply = `ST-901L-X:V5.25,ID:${imei},UP:test-password,U1:test-control-number,U2:,U3:,MODE:GPRS,POWER ALARM:OFF,OVER SPEED:OFF,SHAKE ALARM:OFF,GEO FENCE: OFF,SLEEP:OFF,ACC ALARM SMS: OFF,APN:internet,test-apn-user,test-apn-password,IP:198.51.100.42,5013,GPRS UPLOAD TIME:5,5,TIME ZONE:E00`;

afterAll(() => prisma.$disconnect());
beforeEach(truncateAll);

async function setup() {
  const { user } = await createTestUser({ email: 'config@test.local', role: 'admin' });
  const auth = authHeader(user.id, user.email, 'admin');
  const device = await prisma.trackerDevice.create({ data: { imei } });
  return { auth, device, path: `/api/tracker-devices/${device.id}/configuration` };
}

describe('tracker configuration snapshot', () => {
  it('saves a dated sanitized RCONF snapshot and returns it on later reads', async () => {
    const { auth, device, path } = await setup();
    const before = Date.now();
    const saved = await request(app).patch(path).set('Authorization', auth).send({ reply });
    expect(saved.status).toBe(200);
    expect(saved.body.configuration).toMatchObject({
      source: 'rconf', deviceId: imei, model: 'ST-901L-X', firmware: 'V5.25',
      mode: 'GPRS', apn: 'internet', serverIp: '198.51.100.42', serverPort: 5013,
      ignitionOnIntervalSeconds: 5, ignitionOffIntervalSeconds: 5, timeZone: 'E00',
      sleep: false, powerAlarm: false, overSpeedAlarm: false, shakeAlarm: false,
      geofenceAlarm: false, accAlarmSms: false
    });
    expect(Date.parse(saved.body.configuration.recordedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(saved.body.configuration.recordedAt)).toBeLessThanOrEqual(Date.now());
    const stored = await prisma.trackerDevice.findUniqueOrThrow({ where: { id: device.id } });
    const got = await request(app).get(`/api/tracker-devices/${device.id}`).set('Authorization', auth);
    expect(got.body.configuration).toEqual(saved.body.configuration);
    const serialized = JSON.stringify({ stored, response: saved.body, later: got.body });
    for (const secret of ['test-password', 'test-control-number', 'test-apn-user', 'test-apn-password', 'UP:', 'U1:', reply]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('starts without a configuration rather than fabricating hardware settings', async () => {
    const { auth, device } = await setup();
    const got = await request(app).get(`/api/tracker-devices/${device.id}`).set('Authorization', auth);
    expect(got.body.configuration).toBeNull();
  });

  it('rejects mismatched and malformed reports without replacing the saved snapshot', async () => {
    const { auth, device, path } = await setup();
    const saved = await request(app).patch(path).set('Authorization', auth).send({ reply });
    expect(saved.status).toBe(200);
    for (const bad of [reply.replace(imei, '9999999999'), 'SET OK', reply.replace('5,5', 'broken,5')]) {
      const rejected = await request(app).patch(path).set('Authorization', auth).send({ reply: bad });
      expect(rejected.status).toBe(400);
      const got = await request(app).get(`/api/tracker-devices/${device.id}`).set('Authorization', auth);
      expect(got.body.configuration).toEqual(saved.body.configuration);
    }
  });

  it('bounds and validates the request without echoing raw settings', async () => {
    const { auth, path } = await setup();
    for (const body of [{}, { reply: '' }, { reply: 123 }, { reply: 'x'.repeat(4097) }, { reply, configuration: {} }]) {
      const res = await request(app).patch(path).set('Authorization', auth).send(body);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).not.toContain('test-password');
    }
  });

  it('requires an administrator even when a gateway device key is supplied', async () => {
    const { path } = await setup();
    expect((await request(app).patch(path).send({ reply })).status).toBe(401);
    expect((await request(app).patch(path).set('x-device-api-key', 'test-key').send({ reply })).status).toBe(401);
    const { user } = await createTestUser({ email: 'evp-config@test.local', role: 'evp' });
    const forbidden = await request(app).patch(path).set('Authorization', authHeader(user.id, user.email, 'evp')).send({ reply });
    expect(forbidden.status).toBe(403);
  });

  it('returns 404 for a missing tracker', async () => {
    const { auth } = await setup();
    const res = await request(app).patch('/api/tracker-devices/00000000-0000-4000-8000-000000000999/configuration').set('Authorization', auth).send({ reply });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('clears the previous unit configuration if the registered identifier changes', async () => {
    const { auth, device, path } = await setup();
    expect((await request(app).patch(path).set('Authorization', auth).send({ reply })).status).toBe(200);
    const changed = await request(app).patch(`/api/tracker-devices/${device.id}`).set('Authorization', auth).send({ imei: '2345678901' });
    expect(changed.status).toBe(200);
    expect(changed.body.configuration).toBeNull();
  });

  it('rejects a concurrent identifier edit instead of attaching another unit snapshot', async () => {
    const { auth, device, path } = await setup();
    const saved = await request(app).patch(path).set('Authorization', auth).send({ reply });
    const nextImei = '2345678901';
    const nextConfiguration = { ...saved.body.configuration, deviceId: nextImei };
    const read = repository.findTrackerDeviceById;
    const concurrentRead = async (id: string) => {
      const previous = await read(id);
      // Another administrator replaces the unit after this request reads it.
      await prisma.trackerDevice.update({ where: { id }, data: { imei: nextImei, configuration: nextConfiguration } });
      return previous;
    };
    // The service only awaits this read; the Prisma relation fluent API is unused.
    const spy = vi.spyOn(repository, 'findTrackerDeviceById').mockImplementationOnce(
      id => concurrentRead(id) as ReturnType<typeof read>
    );
    try {
      const changed = await request(app).patch(`/api/tracker-devices/${device.id}`).set('Authorization', auth).send({ imei });
      expect(changed.status).toBe(409);
      expect(changed.body.error.code).toBe('TRACKER_CHANGED');
      const current = await prisma.trackerDevice.findUniqueOrThrow({ where: { id: device.id } });
      expect(current.imei).toBe(nextImei);
      expect(current.configuration).toEqual(nextConfiguration);
    } finally {
      spy.mockRestore();
    }
  });
});
