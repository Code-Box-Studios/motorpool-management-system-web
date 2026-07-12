import type { GatewayConfig } from './config.js';
import type { DecodedFrame } from './h02.js';

export type PositionFrame = Extract<DecodedFrame, { kind: 'position' }>;

export interface Forwarder {
  send(vehicleId: string, frame: PositionFrame): Promise<void>;
}

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 200;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// The API's ingest contract. `engineStatus` is free text; we send 'on'/'off'.
interface IngestBody {
  vehicleId: string;
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  engineStatus?: string;
}

function toIngestBody(vehicleId: string, frame: PositionFrame): IngestBody {
  const body: IngestBody = {
    vehicleId,
    latitude: frame.latitude,
    longitude: frame.longitude
  };
  if (frame.speedKmh !== null) body.speed = frame.speedKmh;
  if (frame.heading !== null) body.heading = frame.heading;
  if (frame.ignition !== null) body.engineStatus = frame.ignition ? 'on' : 'off';
  return body;
}

/** POSTs decoded positions to the API's ingest endpoint, with bounded retry. */
export function createForwarder(config: GatewayConfig): Forwarder {
  const url = `${config.apiUrl}/api/gps/ingest`;

  return {
    async send(vehicleId: string, frame: PositionFrame): Promise<void> {
      const body = JSON.stringify(toIngestBody(vehicleId, frame));

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-device-api-key': config.deviceApiKey },
            body
          });
          if (response.ok) return;
        } catch {
          // fall through to the retry/backoff below
        }
        if (attempt < MAX_ATTEMPTS) await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
      }
      throw new Error(`ingest failed after ${MAX_ATTEMPTS} attempts for vehicle ${vehicleId}`);
    }
  };
}
