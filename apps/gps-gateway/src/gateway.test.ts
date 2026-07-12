import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from './config.js';
import { startGateway } from './gateway.js';

let server: net.Server | null = null;

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
});

// Port 0 asks the OS for an ephemeral port. It is set AFTER loadConfig because
// the env schema (correctly) requires a real port >= 1 in production.
const CONFIG = {
  ...loadConfig({ MMS_API_URL: 'http://127.0.0.1:1', GPS_DEVICE_API_KEY: 'k' }),
  tcpPort: 0
};

const VALID =
  '*HQ,imei-1,V1,084739,A,3123.4537,N,12112.3427,E,010.00,090,200420,00000400,000,00,0,0#';
const VOID_FIX = VALID.replace(',A,', ',V,');

async function sendToGateway(port: number, payload: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const client = net.createConnection({ port }, () => {
      client.write(payload);
      setTimeout(() => {
        client.end();
        resolve();
      }, 150);
    });
    client.on('error', reject);
  });
}

describe('gateway', () => {
  it('decodes a valid frame, resolves the device, and forwards it', async () => {
    const resolve = vi.fn().mockResolvedValue('veh-1');
    const send = vi.fn().mockResolvedValue(undefined);
    server = await startGateway(CONFIG, { registry: { resolve }, forwarder: { send } });

    await sendToGateway((server.address() as AddressInfo).port, VALID);

    expect(resolve).toHaveBeenCalledWith('imei-1');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toBe('veh-1');
    expect(send.mock.calls[0]?.[1]).toMatchObject({ kind: 'position', ignition: true });
  });

  it('does not forward a void (invalid) fix', async () => {
    const resolve = vi.fn().mockResolvedValue('veh-1');
    const send = vi.fn().mockResolvedValue(undefined);
    server = await startGateway(CONFIG, { registry: { resolve }, forwarder: { send } });

    await sendToGateway((server.address() as AddressInfo).port, VOID_FIX);

    expect(send).not.toHaveBeenCalled();
  });

  it('does not forward when the device is unknown', async () => {
    const resolve = vi.fn().mockResolvedValue(null);
    const send = vi.fn().mockResolvedValue(undefined);
    server = await startGateway(CONFIG, { registry: { resolve }, forwarder: { send } });

    await sendToGateway((server.address() as AddressInfo).port, VALID);

    expect(resolve).toHaveBeenCalledWith('imei-1');
    expect(send).not.toHaveBeenCalled();
  });

  it('refreshes liveness on a heartbeat without forwarding a position', async () => {
    const resolve = vi.fn().mockResolvedValue('veh-1');
    const send = vi.fn().mockResolvedValue(undefined);
    server = await startGateway(CONFIG, { registry: { resolve }, forwarder: { send } });

    await sendToGateway((server.address() as AddressInfo).port, '*HQ,imei-1,V0,084739#');

    expect(resolve).toHaveBeenCalledWith('imei-1');
    expect(send).not.toHaveBeenCalled();
  });
});
