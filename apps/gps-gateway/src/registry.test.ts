import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { createRegistry } from './registry.js';

let server: http.Server | null = null;

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
});

async function stubApi(handler: http.RequestListener): Promise<string> {
  server = http.createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('registry', () => {
  it('resolves an IMEI to a vehicle id and caches it', async () => {
    let calls = 0;
    const url = await stubApi((req, res) => {
      calls += 1;
      expect(req.headers['x-device-api-key']).toBe('k');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ vehicleId: 'veh-1' }));
    });
    const registry = createRegistry(loadConfig({ MMS_API_URL: url, GPS_DEVICE_API_KEY: 'k' }));

    expect(await registry.resolve('imei-1')).toBe('veh-1');
    expect(await registry.resolve('imei-1')).toBe('veh-1');
    expect(calls).toBe(1); // second call served from cache
  });

  it('returns null for an unknown device and caches the negative result', async () => {
    let calls = 0;
    const url = await stubApi((_req, res) => {
      calls += 1;
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'DEVICE_NOT_FOUND' } }));
    });
    const registry = createRegistry(loadConfig({ MMS_API_URL: url, GPS_DEVICE_API_KEY: 'k' }));

    expect(await registry.resolve('nope')).toBeNull();
    expect(await registry.resolve('nope')).toBeNull();
    expect(calls).toBe(1);
  });

  it('does not cache a transient server error', async () => {
    let calls = 0;
    const url = await stubApi((_req, res) => {
      calls += 1;
      res.writeHead(500);
      res.end();
    });
    const registry = createRegistry(loadConfig({ MMS_API_URL: url, GPS_DEVICE_API_KEY: 'k' }));

    expect(await registry.resolve('x')).toBeNull();
    expect(await registry.resolve('x')).toBeNull();
    expect(calls).toBe(2);
  });
});
