import type net from 'node:net';
import { randomUUID } from 'node:crypto';
import type { TrackerPacketBody } from '@mms/shared';
import type { GatewayConfig } from './config.js';
import { decodeFrame } from './h02.js';
import { createRegistry, type Registry } from './registry.js';
import {
  createForwarder,
  DeviceUnavailableError,
  type Forwarder
} from './forwarder.js';
import { createPacketLogger, type PacketLogger } from './packet-log.js';
import { startTcpServer } from './tcp-server.js';
import type { FragmentReason } from './framing.js';

export interface GatewayDeps {
  registry: Registry;
  forwarder: Forwarder;
  packetLogger?: PacketLogger;
}

export type GatewayServer = net.Server & { shutdown(): Promise<void> };

function observedHeader(raw: string) {
  const match = /^\*[^,]*,([^,]*),([^,#]*)/.exec(raw);
  const deviceId = match?.[1];
  const messageType = match?.[2];
  return {
    deviceId:
      deviceId && deviceId.length <= 128 && /^[\x21-\x7e]+$/.test(deviceId)
        ? deviceId
        : null,
    messageType:
      messageType &&
      messageType.length <= 32 &&
      /^[\x21-\x7e]+$/.test(messageType)
        ? messageType
        : null
  };
}

/** Records receipts independently of whether their positions can be ingested. */
export async function startGateway(
  config: GatewayConfig,
  deps?: GatewayDeps
): Promise<GatewayServer> {
  const registry = deps?.registry ?? createRegistry(config);
  const forwarder = deps?.forwarder ?? createForwarder(config);
  const logger = deps?.packetLogger ?? (await createPacketLogger(config));
  const processing = new Set<Promise<void>>();

  async function persist(packet: TrackerPacketBody) {
    try {
      await logger.record(packet);
    } catch (error) {
      // A failed disk must be visible, while vehicle position processing continues.
      console.error(`[gateway] failed to persist packet ${packet.id}:`, error);
    }
  }

  const handle = (
    raw: string,
    peer: string,
    connectionId: string,
    fragment?: FragmentReason,
    socketError?: Error
  ): void => {
    const frame = decodeFrame(raw, config.speedUnit);
    const packet: TrackerPacketBody = {
      id: randomUUID(),
      revision: 0,
      receivedAt: new Date().toISOString(),
      connectionId,
      peer,
      ...observedHeader(raw),
      vehicleId: null,
      kind: socketError ? 'socket_error' : fragment ? 'fragment' : frame.kind,
      outcome: 'received',
      rawHex: Buffer.from(raw, 'latin1').toString('hex'),
      fixTime:
        frame.kind === 'position'
          ? (frame.fixTime?.toISOString() ?? null)
          : null,
      latitude: frame.kind === 'position' ? frame.latitude : null,
      longitude: frame.kind === 'position' ? frame.longitude : null,
      speed: frame.kind === 'position' ? frame.speedKmh : null,
      heading: frame.kind === 'position' ? frame.heading : null,
      ignition: frame.kind === 'position' ? frame.ignition : null,
      reason: null
    };
    const task = (async () => {
      await persist(packet);
      const result: TrackerPacketBody = { ...packet, revision: 1 };
      if (socketError) {
        result.outcome = 'socket_error';
        result.reason = socketError.message.slice(0, 2000);
      } else if (fragment) {
        result.outcome = fragment === 'unknown' ? 'unsupported' : fragment;
        result.reason =
          fragment === 'unknown'
            ? 'Bytes outside supported H02 text framing'
            : fragment === 'oversized'
              ? 'Message exceeded the 8192-byte framing limit'
              : 'Socket closed before the message completed';
      } else if (frame.kind === 'unknown') {
        result.outcome = 'unsupported';
        result.reason = 'Malformed or unsupported H02 message';
      } else if (
        frame.kind === 'position' &&
        (!frame.valid ||
          Math.abs(frame.latitude) > 90 ||
          Math.abs(frame.longitude) > 180)
      ) {
        result.outcome = 'invalid_fix';
        result.reason = !frame.valid
          ? 'Tracker reported an invalid GPS fix'
          : 'Coordinates were outside geographic bounds';
      } else {
        let vehicleId: string | null = null;
        try {
          vehicleId = await registry.resolve(frame.deviceId);
          result.vehicleId = vehicleId;
          result.outcome =
            frame.kind === 'heartbeat' ? 'heartbeat' : 'device_unavailable';
          if (!vehicleId)
            result.reason =
              'No active registered vehicle assignment was available';
        } catch (error) {
          result.outcome = 'resolution_error';
          result.reason =
            error instanceof Error
              ? error.message.slice(0, 2000)
              : 'Device resolution failed';
        }
        if (vehicleId && frame.kind === 'position') {
          try {
            const saved = await forwarder.send(vehicleId, frame, packet);
            result.vehicleId = saved?.vehicleId ?? vehicleId;
            result.outcome = 'saved';
          } catch (error) {
            result.vehicleId = null;
            result.outcome =
              error instanceof DeviceUnavailableError
                ? 'device_unavailable'
                : 'forward_error';
            result.reason =
              error instanceof Error
                ? error.message.slice(0, 2000)
                : 'Position ingest failed';
          }
        }
      }
      await persist(result);
    })().catch((error) =>
      console.error(
        `[gateway] packet processing failed for ${packet.deviceId ?? peer}:`,
        error
      )
    );
    processing.add(task);
    void task.finally(() => processing.delete(task));
  };

  try {
    const server = await startTcpServer({
      port: config.tcpPort,
      idleTimeoutMs: config.socketIdleTimeoutMs,
      onFrame: (raw, peer, connectionId) => handle(raw, peer, connectionId),
      onFragment: (raw, reason, peer, connectionId) =>
        handle(raw, peer, connectionId, reason),
      onError: (error, peer, connectionId) =>
        handle('', peer, connectionId, undefined, error)
    });
    let cleanup: Promise<void> | null = null;
    const finish = () =>
      (cleanup ??= Promise.allSettled([...processing]).then(() =>
        logger.close()
      ));
    server.once('close', () => {
      void finish().catch((error) =>
        console.error('[gateway] packet logger shutdown failed:', error)
      );
    });
    let shuttingDown: Promise<void> | null = null;
    return Object.assign(server, {
      shutdown: () =>
        (shuttingDown ??= (async () => {
          const closed = new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve()))
          );
          server.closeConnections();
          await closed;
          await finish();
        })())
    });
  } catch (error) {
    await logger.close();
    throw error;
  }
}
