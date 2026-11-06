import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { trackerPacketBodySchema, type TrackerPacketBody } from '@mms/shared';
import type { GatewayConfig } from './config.js';

export interface PacketLogger {
  record(packet: TrackerPacketBody): Promise<void>;
  close(): Promise<void>;
}

/** Disk-first, ordered, at-least-once delivery. API receipt UUIDs deduplicate retries. */
export async function createPacketLogger(
  config: GatewayConfig
): Promise<PacketLogger> {
  mkdirSync(config.packetLogDir, { recursive: true, mode: 0o700 });
  // A crash can occur after fsync but before rename. Recover only intact events;
  // damaged files remain on disk and fail startup for explicit operator recovery.
  for (const name of readdirSync(config.packetLogDir).filter((entry) =>
    entry.endsWith('.json.tmp')
  )) {
    const temporary = join(config.packetLogDir, name);
    const body = readFileSync(temporary, 'utf8');
    const packet = trackerPacketBodySchema.parse(JSON.parse(body));
    const target = join(
      config.packetLogDir,
      `${packet.id}.${packet.revision}.json`
    );
    if (existsSync(target)) {
      if (readFileSync(target, 'utf8') !== body)
        throw new Error('Conflicting packet log recovery files');
      unlinkSync(temporary);
    } else renameSync(temporary, target);
  }
  const directory = openSync(config.packetLogDir, 'r');
  fsyncSync(directory);
  let stopped = false;
  let running: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let activeRequest: AbortController | null = null;
  let delay = config.packetLogRetryMs;

  const pending = () =>
    readdirSync(config.packetLogDir)
      .filter((name) => name.endsWith('.json'))
      .sort();
  const schedule = () => {
    if (stopped || timer) return;
    timer = setTimeout(() => {
      timer = null;
      kick();
    }, delay);
    timer.unref();
  };
  const drain = async () => {
    for (;;) {
      if (stopped) return;
      const name = pending()[0];
      if (!name) return;
      const path = join(config.packetLogDir, name);
      try {
        const body = readFileSync(path, 'utf8');
        // A damaged record stays on disk for operator recovery, never silently deleted.
        JSON.parse(body);
        activeRequest = new AbortController();
        const response = await fetch(`${config.apiUrl}/api/gps/packet-logs`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-device-api-key': config.deviceApiKey
          },
          body,
          signal: AbortSignal.any([
            activeRequest.signal,
            AbortSignal.timeout(config.apiTimeoutMs)
          ])
        });
        await response.body?.cancel();
        if (!response.ok)
          throw new Error(`packet log upload HTTP ${response.status}`);
        unlinkSync(path);
        fsyncSync(directory);
        delay = config.packetLogRetryMs;
      } catch (error) {
        if (!stopped)
          console.error(
            '[gateway] packet logs queued on disk; upload failed:',
            error
          );
        delay = Math.min(Math.max(delay * 2, config.packetLogRetryMs), 30_000);
        return;
      } finally {
        activeRequest = null;
      }
    }
  };
  function kick() {
    if (stopped || running) return;
    running = drain()
      .catch((error) => {
        console.error('[gateway] packet log spool read failed:', error);
      })
      .finally(() => {
        running = null;
        if (!stopped) schedule();
      });
  }

  kick();
  return {
    async record(packet) {
      if (stopped) throw new Error('Packet log spool is closed');
      const path = join(
        config.packetLogDir,
        `${packet.id}.${packet.revision}.json`
      );
      const body = JSON.stringify(packet);
      if (existsSync(path)) {
        if (readFileSync(path, 'utf8') !== body)
          throw new Error('Packet log receipt identity conflict');
        return;
      }
      const used = readdirSync(config.packetLogDir).reduce(
        (total, name) => total + statSync(join(config.packetLogDir, name)).size,
        0
      );
      if (used + Buffer.byteLength(body) > config.packetLogMaxBytes) {
        throw new Error(
          'Packet log spool capacity exceeded; receipt was not persisted'
        );
      }
      const temporary = path + '.tmp';
      let file: number | null = null;
      try {
        file = openSync(temporary, 'w', 0o600);
        writeFileSync(file, body);
        fsyncSync(file);
        closeSync(file);
        file = null;
        renameSync(temporary, path);
        fsyncSync(directory);
      } catch (error) {
        if (file !== null) closeSync(file);
        throw error;
      }
      kick();
    },
    async close() {
      if (stopped) return;
      stopped = true;
      if (timer) clearTimeout(timer);
      activeRequest?.abort();
      await running;
      closeSync(directory);
    }
  };
}
