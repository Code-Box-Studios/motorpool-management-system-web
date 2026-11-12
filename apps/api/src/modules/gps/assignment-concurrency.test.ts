import { randomUUID } from 'node:crypto';
import type { TrackerPacketBody } from '@mms/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { truncateAll } from '../../test/db.js';
import { createTestBranch, createTestVehicle } from '../../test/factories.js';

const app = createApp();

function packet(deviceId: string): TrackerPacketBody {
  return {
    id: randomUUID(),
    revision: 0,
    receivedAt: new Date().toISOString(),
    connectionId: randomUUID(),
    peer: '127.0.0.1:15013',
    deviceId,
    vehicleId: null,
    messageType: 'V1',
    kind: 'position',
    outcome: 'received',
    rawHex: '2a485123',
    fixTime: null,
    latitude: 7.07,
    longitude: 125.6,
    speed: 0,
    heading: 0,
    ignition: true,
    reason: null
  };
}

async function fixture() {
  const branch = await createTestBranch();
  const a = await createTestVehicle(branch.id);
  const b = await createTestVehicle(branch.id);
  const tracker = await prisma.trackerDevice.create({
    data: { imei: 'assignment-test', vehicleId: a.id }
  });
  const ingest = (receipt = packet(tracker.imei)) =>
    request(app)
      .post('/api/gps/ingest')
      .set('x-device-api-key', 'assignment-key')
      .send({
        vehicleId: a.id,
        deviceId: tracker.imei,
        protocol: 'h02',
        latitude: receipt.latitude,
        longitude: receipt.longitude,
        packet: receipt
      });
  return { a, b, tracker, ingest };
}

describe('identified GPS assignment', () => {
  beforeEach(async () => {
    await truncateAll();
    process.env.GPS_DEVICE_API_KEY = 'assignment-key';
  });
  afterEach(() => {
    delete process.env.GPS_DEVICE_API_KEY;
  });
  afterAll(() => prisma.$disconnect());

  it('overrides cached assignment and commits the same vehicle on GPS and packet log', async () => {
    const s = await fixture();
    await prisma.trackerDevice.update({
      where: { id: s.tracker.id },
      data: { vehicleId: s.b.id }
    });
    const receipt = packet(s.tracker.imei);
    const response = await s.ingest(receipt);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      vehicleId: s.b.id,
      gpsId: receipt.id
    });
    expect(
      await prisma.gpsData.findUniqueOrThrow({ where: { id: receipt.id } })
    ).toMatchObject({ vehicleId: s.b.id });
    expect(
      await prisma.trackerPacketLog.findUniqueOrThrow({
        where: { id: receipt.id }
      })
    ).toMatchObject({ vehicleId: s.b.id, outcome: 'saved', revision: 1 });
    expect(
      await prisma.vehicle.findUniqueOrThrow({ where: { id: s.a.id } })
    ).toMatchObject({ latitude: null, lastLocationUpdate: null });
    // The old cached A cannot overwrite a final receipt, even after another edit.
    await prisma.trackerDevice.update({
      where: { id: s.tracker.id },
      data: { vehicleId: s.a.id }
    });
    expect(
      (
        await request(app)
          .post('/api/gps/packet-logs')
          .set('x-device-api-key', 'assignment-key')
          .send({
            ...receipt,
            revision: 1,
            outcome: 'saved',
            vehicleId: s.a.id
          })
      ).status
    ).toBe(201);
    expect(
      await prisma.trackerPacketLog.findUniqueOrThrow({
        where: { id: receipt.id }
      })
    ).toMatchObject({ vehicleId: s.b.id });
    expect((await s.ingest(receipt)).body.vehicleId).toBe(s.b.id);
    expect(await prisma.gpsData.count()).toBe(1);
  });

  it.each([{ status: 'inactive' as const }, { vehicleId: null }])(
    'refuses an unavailable identified device %j without appending points',
    async (data) => {
      const s = await fixture();
      await prisma.trackerDevice.update({ where: { id: s.tracker.id }, data });
      const response = await s.ingest();
      expect(response.status).toBe(404);
      expect(['DEVICE_NOT_FOUND', 'NO_VEHICLE_ASSIGNED']).toContain(
        response.body.error.code
      );
      expect(await prisma.gpsData.count()).toBe(0);
      expect(await prisma.trackerPacketLog.count()).toBe(0);
    }
  );

  it('waits for a tracker edit and rechecks the committed assignment under its row lock', async () => {
    const s = await fixture();
    let release!: () => void;
    let signal!: (pid: number) => void;
    const ready = new Promise<number>((resolve) => {
      signal = resolve;
    });
    const proceed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const editor = prisma.$transaction(
      async (tx) => {
        await tx.trackerDevice.update({
          where: { id: s.tracker.id },
          data: { vehicleId: s.b.id }
        });
        const [backend] = await tx.$queryRaw<
          { pid: number }[]
        >`SELECT pg_backend_pid() AS pid`;
        signal(backend!.pid);
        await proceed;
      },
      { timeout: 10000 }
    );
    let result!: Promise<request.Response>;
    try {
      const pid = await ready;
      result = s.ingest().then((response) => response);
      const deadline = Date.now() + 3000;
      let waiting = false;
      while (Date.now() < deadline) {
        const [row] = await prisma.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM pg_stat_activity
            WHERE datname = current_database() AND ${pid} = ANY(pg_blocking_pids(pid))) AS waiting`;
        if (row?.waiting) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
    } finally {
      release();
      await editor;
      await result;
    }
    const response = await result;
    expect(response.status).toBe(201);
    expect(response.body.vehicleId).toBe(s.b.id);
  }, 15000);
});
