import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { startTcpServer } from './tcp-server.js';

let server: net.Server | null = null;

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
});

describe('startTcpServer', () => {
  it('hands complete frames to onFrame, reassembling split writes', async () => {
    const frames: string[] = [];
    server = await startTcpServer({ port: 0, idleTimeoutMs: 60_000, onFrame: (raw) => frames.push(raw) });
    const { port } = server.address() as AddressInfo;

    await new Promise<void>((resolve, reject) => {
      const client = net.createConnection({ port }, () => {
        client.write('*HQ,1,V1,a#*HQ,2,V1');
        client.write(',b#');
        setTimeout(() => {
          client.end();
          resolve();
        }, 100);
      });
      client.on('error', reject);
    });

    expect(frames).toEqual(['*HQ,1,V1,a#', '*HQ,2,V1,b#']);
  });
});
