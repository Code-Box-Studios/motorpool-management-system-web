import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from './config.js';
import { startGateway } from './gateway.js';
import type { TrackerPacketBody } from '@mms/shared';
import type { GatewayDeps } from './gateway.js';
import { DeviceUnavailableError } from './forwarder.js';

let server: net.Server | null = null;

afterEach(async () => {
  if (server)
    await new Promise<void>((resolve) => server!.close(() => resolve()));
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

const startTestGateway = (deps: GatewayDeps) =>
  startGateway(CONFIG, {
    packetLogger: { record: async () => {}, close: async () => {} },
    ...deps
  });

async function sendToGateway(
  port: number,
  payload: string | Buffer
): Promise<void> {
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
  it.each([false, true])(
    'records authoritative reassignment or inactive rejection (inactive=%s)',
    async (inactive) => {
      const packets: TrackerPacketBody[] = [];
      server = await startTestGateway({
        registry: { resolve: async () => 'cached-A' },
        forwarder: {
          send: async (_vehicle, _frame, receipt) => {
            expect(receipt?.deviceId).toBe('imei-1');
            expect(receipt?.revision).toBe(0);
            if (inactive)
              throw new DeviceUnavailableError('Unknown or inactive device');
            return { vehicleId: 'current-B' };
          }
        },
        packetLogger: {
          record: async (packet) => {
            packets.push(packet);
          },
          close: async () => {}
        }
      });
      await sendToGateway((server.address() as AddressInfo).port, VALID);
      expect(packets.at(-1)).toMatchObject({
        vehicleId: inactive ? null : 'current-B',
        outcome: inactive ? 'device_unavailable' : 'saved'
      });
    }
  );

  it('decodes a valid frame, resolves the device, and forwards it', async () => {
    const resolve = vi.fn().mockResolvedValue('veh-1');
    const send = vi.fn().mockResolvedValue(undefined);
    server = await startTestGateway({
      registry: { resolve },
      forwarder: { send }
    });

    await sendToGateway((server.address() as AddressInfo).port, VALID);

    expect(resolve).toHaveBeenCalledWith('imei-1');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toBe('veh-1');
    expect(send.mock.calls[0]?.[1]).toMatchObject({
      kind: 'position',
      ignition: true
    });
  });

  it('does not forward a void (invalid) fix', async () => {
    const resolve = vi.fn().mockResolvedValue('veh-1');
    const send = vi.fn().mockResolvedValue(undefined);
    server = await startTestGateway({
      registry: { resolve },
      forwarder: { send }
    });

    await sendToGateway((server.address() as AddressInfo).port, VOID_FIX);

    expect(send).not.toHaveBeenCalled();
  });

  it.each(['V6', 'V8'])(
    'forwards an ST-901L-X %s position received over TCP',
    async (type) => {
      const resolve = vi.fn().mockResolvedValue('veh-1');
      const send = vi.fn().mockResolvedValue(undefined);
      server = await startTestGateway({
        registry: { resolve },
        forwarder: { send }
      });

      await sendToGateway(
        (server.address() as AddressInfo).port,
        VALID.replace(',V1,', `,${type},`)
      );

      expect(resolve).toHaveBeenCalledWith('imei-1');
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toBe('veh-1');
      expect(send.mock.calls[0]?.[1]).toMatchObject({
        kind: 'position',
        deviceId: 'imei-1',
        valid: true,
        speedKmh: 18.52
      });
    }
  );

  it('does not forward when the device is unknown', async () => {
    const resolve = vi.fn().mockResolvedValue(null);
    const send = vi.fn().mockResolvedValue(undefined);
    server = await startTestGateway({
      registry: { resolve },
      forwarder: { send }
    });

    await sendToGateway((server.address() as AddressInfo).port, VALID);

    expect(resolve).toHaveBeenCalledWith('imei-1');
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['V0', 'H1'])(
    'refreshes liveness on a %s heartbeat without forwarding a position',
    async (type) => {
      const resolve = vi.fn().mockResolvedValue('veh-1');
      const send = vi.fn().mockResolvedValue(undefined);
      server = await startTestGateway({
        registry: { resolve },
        forwarder: { send }
      });

      await sendToGateway(
        (server.address() as AddressInfo).port,
        `*HQ,imei-1,${type},084739#`
      );

      expect(resolve).toHaveBeenCalledWith('imei-1');
      expect(send).not.toHaveBeenCalled();
    }
  );

  it.each([
    [VALID, 'saved'],
    [VOID_FIX, 'invalid_fix'],
    ['*HQ,imei-1,H1,084739#', 'heartbeat'],
    ['*HQ,imei-1,V99,084739#', 'unsupported']
  ])('preserves receipt and final outcome for %s', async (payload, outcome) => {
    const packets: TrackerPacketBody[] = [];
    server = await startTestGateway({
      registry: { resolve: async () => 'd4b4c181-ddfa-404a-b609-fb5b7c072e93' },
      forwarder: { send: async () => {} },
      packetLogger: {
        record: async (packet) => {
          packets.push(packet);
        },
        close: async () => {}
      }
    });
    await sendToGateway((server.address() as AddressInfo).port, payload);
    expect(packets).toHaveLength(2);
    expect(packets[0]).toMatchObject({
      revision: 0,
      outcome: 'received',
      deviceId: 'imei-1',
      rawHex: Buffer.from(payload).toString('hex')
    });
    expect(packets[1]).toMatchObject({
      id: packets[0]!.id,
      revision: 1,
      outcome
    });
  });

  it('records binary bytes and incomplete disconnect data without making up a tracker ID', async () => {
    const packets: TrackerPacketBody[] = [];
    server = await startTestGateway({
      registry: { resolve: async () => null },
      forwarder: { send: async () => {} },
      packetLogger: {
        record: async (packet) => {
          packets.push(packet);
        },
        close: async () => {}
      }
    });
    const port = (server.address() as AddressInfo).port;
    await sendToGateway(
      port,
      Buffer.concat([Buffer.from([0x00, 0xff]), Buffer.from('*HQ,')])
    );
    await expect
      .poll(() => packets.filter((packet) => packet.revision === 1))
      .toHaveLength(2);
    const finals = packets.filter((packet) => packet.revision === 1);
    expect(finals.every((packet) => packet.deviceId === null)).toBe(true);
    expect(
      finals.find((packet) => packet.outcome === 'incomplete')?.rawHex
    ).toBe('2a48512c');
    expect(
      finals.find((packet) => packet.outcome === 'unsupported')?.rawHex
    ).toBe('00ff');
  });

  it.each([
    ['lookup', 'resolution_error'],
    ['forward', 'forward_error'],
    ['unassigned', 'device_unavailable']
  ])(
    'distinguishes %s failures in the recorded outcome',
    async (failure, outcome) => {
      const packets: TrackerPacketBody[] = [];
      server = await startTestGateway({
        registry: {
          resolve: async () => {
            if (failure === 'lookup') throw new Error('API unavailable');
            return failure === 'unassigned'
              ? null
              : 'd4b4c181-ddfa-404a-b609-fb5b7c072e93';
          }
        },
        forwarder: {
          send: async () => {
            if (failure === 'forward') throw new Error('ingest failed');
          }
        },
        packetLogger: {
          record: async (packet) => {
            packets.push(packet);
          },
          close: async () => {}
        }
      });
      await sendToGateway((server.address() as AddressInfo).port, VALID);
      expect(packets.at(-1)?.outcome).toBe(outcome);
    }
  );

  it('keeps malformed header bytes while leaving unsafe tracker identity unknown', async () => {
    const packets: TrackerPacketBody[] = [];
    server = await startTestGateway({
      registry: { resolve: async () => null },
      forwarder: { send: async () => {} },
      packetLogger: {
        record: async (packet) => {
          packets.push(packet);
        },
        close: async () => {}
      }
    });
    await sendToGateway(
      (server.address() as AddressInfo).port,
      '*HQ,\u0000,V99#'
    );
    expect(packets.at(-1)?.deviceId).toBeNull();
    expect(packets.at(-1)?.rawHex).toBe('2a48512c002c56393923');
  });

  it('persists a partial message from an active socket during graceful shutdown', async () => {
    const packets: TrackerPacketBody[] = [];
    const gateway = await startTestGateway({
      registry: { resolve: async () => null },
      forwarder: { send: async () => {} },
      packetLogger: {
        record: async (packet) => {
          packets.push(packet);
        },
        close: async () => {}
      }
    });
    server = gateway;
    const arrived = new Promise<void>((resolve) =>
      gateway.once('connection', (socket) =>
        socket.once('data', () => resolve())
      )
    );
    const client = net.connect(
      { port: (gateway.address() as AddressInfo).port },
      () => client.write('*HQ,still-open')
    );
    try {
      await arrived;
      await gateway.shutdown();
      server = null;
      expect(
        packets.find((packet) => packet.outcome === 'incomplete')?.rawHex
      ).toBe(Buffer.from('*HQ,still-open').toString('hex'));
    } finally {
      client.destroy();
    }
  });
});
