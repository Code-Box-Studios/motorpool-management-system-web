import type net from 'node:net';
import type { GatewayConfig } from './config.js';
import { decodeFrame } from './h02.js';
import { createRegistry, type Registry } from './registry.js';
import { createForwarder, type Forwarder } from './forwarder.js';
import { startTcpServer } from './tcp-server.js';

export interface GatewayDeps {
  registry: Registry;
  forwarder: Forwarder;
}

/**
 * Wires the pipeline: TCP frame -> decode -> resolve IMEI -> forward to ingest.
 * Deps are injectable so the pipeline can be tested without a real API.
 */
export function startGateway(config: GatewayConfig, deps?: GatewayDeps): Promise<net.Server> {
  const registry = deps?.registry ?? createRegistry(config);
  const forwarder = deps?.forwarder ?? createForwarder(config);

  const handleFrame = (raw: string, peer: string): void => {
    const frame = decodeFrame(raw, config.speedUnit);

    if (frame.kind === 'unknown') {
      console.warn(`[gateway] unknown frame from ${peer}: ${JSON.stringify(raw)}`);
      return;
    }

    // A heartbeat still proves the device is alive: resolve() stamps lastSeenAt.
    if (frame.kind === 'heartbeat') {
      void registry.resolve(frame.deviceId);
      return;
    }

    if (!frame.valid) {
      console.info(`[gateway] dropping void fix from ${frame.deviceId}`);
      return;
    }

    void (async () => {
      try {
        const vehicleId = await registry.resolve(frame.deviceId);
        if (!vehicleId) {
          console.warn(`[gateway] unregistered/unassigned device ${frame.deviceId} — dropping`);
          return;
        }
        await forwarder.send(vehicleId, frame);
      } catch (error) {
        console.error(`[gateway] forward failed for ${frame.deviceId}:`, error);
      }
    })();
  };

  return startTcpServer({
    port: config.tcpPort,
    idleTimeoutMs: config.socketIdleTimeoutMs,
    onFrame: handleFrame,
    onError: (error, peer) => console.warn(`[gateway] socket error ${peer}: ${error.message}`)
  });
}
