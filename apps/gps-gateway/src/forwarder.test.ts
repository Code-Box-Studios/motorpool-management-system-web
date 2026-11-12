import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { createForwarder, DeviceUnavailableError } from './forwarder.js';
import type { DecodedFrame } from './h02.js';

let server: http.Server | null = null;

afterEach(async () => {
  if (server)
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
});

const position: Extract<DecodedFrame, { kind: 'position' }> = {
  kind: 'position',
  deviceId: 'imei-1',
  valid: true,
  latitude: 14.5995,
  longitude: 120.9842,
  speedKmh: 42,
  heading: 90,
  ignition: true,
  fixTime: new Date('2026-07-12T00:00:00.000Z'),
  raw: '*HQ,imei-1,V1,...#'
};

describe('forwarder', () => {
  it('POSTs the ingest body with the device key', async () => {
    const bodies: unknown[] = [];
    server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        expect(req.url).toBe('/api/gps/ingest');
        expect(req.headers['x-device-api-key']).toBe('k');
        bodies.push(JSON.parse(raw));
        res.writeHead(200);
        res.end(JSON.stringify({ vehicleId: 'veh-1' }));
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const forwarder = createForwarder(
      loadConfig({ MMS_API_URL: url, GPS_DEVICE_API_KEY: 'k' })
    );
    await forwarder.send('veh-1', position);

    expect(bodies).toEqual([
      {
        vehicleId: 'veh-1',
        deviceId: 'imei-1',
        protocol: 'h02',
        latitude: 14.5995,
        longitude: 120.9842,
        speed: 42,
        heading: 90,
        engineStatus: 'on'
      }
    ]);
  });

  it('maps ignition false to engineStatus off', async () => {
    const bodies: Array<{ engineStatus?: string }> = [];
    server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        bodies.push(JSON.parse(raw));
        res.writeHead(200);
        res.end(JSON.stringify({ vehicleId: 'veh-1' }));
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const forwarder = createForwarder(
      loadConfig({ MMS_API_URL: url, GPS_DEVICE_API_KEY: 'k' })
    );
    await forwarder.send('veh-1', { ...position, ignition: false });

    expect(bodies[0]?.engineStatus).toBe('off');
  });

  it('returns the server assignment after a cached vehicle was reassigned', async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(201);
      res.end(JSON.stringify({ vehicleId: 'veh-2' }));
    });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const forwarder = createForwarder(
      loadConfig({ MMS_API_URL: url, GPS_DEVICE_API_KEY: 'k' })
    );
    expect(await forwarder.send('veh-1', position)).toEqual({
      vehicleId: 'veh-2'
    });
  });

  it('does not retry an authoritative inactive-device rejection', async () => {
    let attempts = 0;
    server = http.createServer((_req, res) => {
      attempts += 1;
      res.writeHead(404);
      res.end(JSON.stringify({ error: { code: 'DEVICE_NOT_FOUND' } }));
    });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const forwarder = createForwarder(
      loadConfig({ MMS_API_URL: url, GPS_DEVICE_API_KEY: 'k' })
    );
    await expect(forwarder.send('veh-1', position)).rejects.toBeInstanceOf(
      DeviceUnavailableError
    );
    expect(attempts).toBe(1);
  });

  it('retries a failing POST and eventually succeeds', async () => {
    let attempts = 0;
    server = http.createServer((_req, res) => {
      attempts += 1;
      res.writeHead(attempts < 3 ? 500 : 200);
      res.end(JSON.stringify({ vehicleId: 'veh-1' }));
    });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const forwarder = createForwarder(
      loadConfig({ MMS_API_URL: url, GPS_DEVICE_API_KEY: 'k' })
    );
    await forwarder.send('veh-1', position);

    expect(attempts).toBe(3);
  });
});
