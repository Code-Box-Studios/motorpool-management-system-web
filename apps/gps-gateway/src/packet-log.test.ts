import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { createPacketLogger, type PacketLogger } from './packet-log.js';

const dirs: string[] = [];
const loggers: PacketLogger[] = [];
const servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(loggers.splice(0).map((logger) => logger.close()));
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve()))
      )
  );
  await Promise.all(
    dirs.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

async function setup(handler: http.RequestListener) {
  const dir = await mkdtemp(join(tmpdir(), 'mms-packets-'));
  dirs.push(dir);
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const config = {
    ...loadConfig({
      MMS_API_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      GPS_DEVICE_API_KEY: 'test-key'
    }),
    packetLogDir: dir,
    packetLogRetryMs: 20
  };
  return { dir, config };
}

function receipt() {
  return {
    id: randomUUID(),
    revision: 0 as const,
    receivedAt: new Date().toISOString(),
    connectionId: randomUUID(),
    peer: '127.0.0.1:1234',
    deviceId: 'unknown-1',
    vehicleId: null,
    messageType: 'H1',
    kind: 'heartbeat' as const,
    outcome: 'received' as const,
    rawHex: Buffer.from('*HQ,unknown-1,H1#').toString('hex'),
    fixTime: null,
    latitude: null,
    longitude: null,
    speed: null,
    heading: null,
    ignition: null,
    reason: null
  };
}

describe('durable packet log upload', () => {
  it('uploads original receipt bytes with gateway authentication and removes acknowledged files', async () => {
    const received: unknown[] = [];
    const { config, dir } = await setup((req, res) => {
      expect(req.url).toBe('/api/gps/packet-logs');
      expect(req.headers['x-device-api-key']).toBe('test-key');
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        received.push(JSON.parse(body));
        res.writeHead(201).end('{}');
      });
    });
    const logger = await createPacketLogger(config);
    loggers.push(logger);
    const packet = receipt();
    await logger.record(packet);
    await expect.poll(() => received).toEqual([packet]);
    await expect
      .poll(async () =>
        (await readdir(dir)).filter((name) => name.endsWith('.json'))
      )
      .toEqual([]);
  });

  it('replays pending receipts and final outcomes after an outage and restart using their original IDs', async () => {
    let healthy = false;
    const delivered: { id: string; revision: number }[] = [];
    const { config, dir } = await setup((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        if (healthy) delivered.push(JSON.parse(body));
        res.writeHead(healthy ? 201 : 503).end('{}');
      });
    });
    const first = await createPacketLogger(config);
    const packet = receipt();
    await first.record(packet);
    await first.record({ ...packet, revision: 1, outcome: 'heartbeat' });
    await first.close();
    expect(
      (await readdir(dir)).filter((name) => name.endsWith('.json'))
    ).toHaveLength(2);
    healthy = true;
    const restarted = await createPacketLogger(config);
    loggers.push(restarted);
    await expect.poll(() => delivered.length).toBe(2);
    expect(delivered.map(({ id, revision }) => ({ id, revision }))).toEqual([
      { id: packet.id, revision: 0 },
      { id: packet.id, revision: 1 }
    ]);
  });

  it('reports a full spool rather than silently accepting an unrecorded packet', async () => {
    const { config } = await setup((_req, res) => res.writeHead(503).end());
    const logger = await createPacketLogger({
      ...config,
      packetLogMaxBytes: 1
    });
    loggers.push(logger);
    await expect(logger.record(receipt())).rejects.toThrow(/capacity/i);
  });

  it('recovers a complete atomic-write temporary file left by a crash', async () => {
    const delivered: unknown[] = [];
    const { config, dir } = await setup((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        delivered.push(JSON.parse(body));
        res.writeHead(201).end('{}');
      });
    });
    const packet = receipt();
    await writeFile(
      join(dir, `${packet.id}.0.json.tmp`),
      JSON.stringify(packet)
    );
    const logger = await createPacketLogger(config);
    loggers.push(logger);
    await expect.poll(() => delivered).toEqual([packet]);
  });
});
