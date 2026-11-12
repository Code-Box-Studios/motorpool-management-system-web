import type { GatewayConfig } from './config.js';

export interface Registry {
  resolve(deviceId: string): Promise<string | null>;
}

interface CacheEntry {
  vehicleId: string | null;
  expiresAt: number;
}

/**
 * IMEI -> vehicleId, via the API's device-key-authenticated resolve endpoint.
 * Positive AND negative results are cached (an unregistered device shouldn't
 * hammer the API on every frame). Transient failures are NOT cached.
 * This cache only gates forwarding. Identified ingest rechecks assignment under
 * the tracker row lock; cached positive entries cannot authorize stale writes.
 */
export function createRegistry(config: GatewayConfig): Registry {
  const cache = new Map<string, CacheEntry>();

  return {
    async resolve(deviceId: string): Promise<string | null> {
      const hit = cache.get(deviceId);
      if (hit && hit.expiresAt > Date.now()) return hit.vehicleId;

      const url = `${config.apiUrl}/api/tracker-devices/resolve?deviceId=${encodeURIComponent(deviceId)}`;
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { 'x-device-api-key': config.deviceApiKey },
          signal: AbortSignal.timeout(config.apiTimeoutMs)
        });
      } catch (error) {
        throw new Error('Device resolution request failed', { cause: error });
      }

      if (response.status === 404) {
        // Unknown / inactive / unassigned: a stable "no" worth caching.
        cache.set(deviceId, {
          vehicleId: null,
          expiresAt: Date.now() + config.registryCacheTtlMs
        });
        return null;
      }
      if (!response.ok) {
        throw new Error(`Device resolution HTTP ${response.status}`);
      }

      const body = (await response.json()) as { vehicleId?: unknown };
      if (typeof body.vehicleId !== 'string' || !body.vehicleId) {
        throw new Error(
          'Device resolution returned an invalid vehicle assignment'
        );
      }
      const vehicleId = body.vehicleId;
      cache.set(deviceId, {
        vehicleId,
        expiresAt: Date.now() + config.registryCacheTtlMs
      });
      return vehicleId;
    }
  };
}
