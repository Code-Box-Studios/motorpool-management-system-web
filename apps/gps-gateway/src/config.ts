import { z } from 'zod';

// Validated env — the gateway refuses to boot without a device key (fail closed).
const envSchema = z.object({
  GATEWAY_TCP_PORT: z.coerce.number().int().min(1).max(65535).default(5013),
  MMS_API_URL: z.string().min(1),
  GPS_DEVICE_API_KEY: z.string().min(1),
  REGISTRY_CACHE_TTL_MS: z.coerce.number().int().min(0).default(300_000),
  FORWARD_QUEUE_MAX: z.coerce.number().int().min(1).default(1000),
  SOCKET_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).default(600_000),
  // H02 speed is firmware-dependent; conventionally knots. Confirm on capture.
  SPEED_UNIT: z.enum(['knots', 'kmh']).default('knots'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PACKET_LOG_DIR: z.string().min(1).default('.packet-log-spool'),
  PACKET_LOG_MAX_BYTES: z.coerce.number().int().min(1).default(268_435_456),
  PACKET_LOG_RETRY_MS: z.coerce.number().int().min(10).default(1000),
  API_TIMEOUT_MS: z.coerce.number().int().min(1).default(5000)
});

export interface GatewayConfig {
  tcpPort: number;
  apiUrl: string;
  deviceApiKey: string;
  registryCacheTtlMs: number;
  forwardQueueMax: number;
  socketIdleTimeoutMs: number;
  speedUnit: 'knots' | 'kmh';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  packetLogDir: string;
  packetLogMaxBytes: number;
  packetLogRetryMs: number;
  apiTimeoutMs: number;
}

export function loadConfig(
  source: NodeJS.ProcessEnv = process.env
): GatewayConfig {
  const env = envSchema.parse(source);
  return {
    tcpPort: env.GATEWAY_TCP_PORT,
    apiUrl: env.MMS_API_URL.replace(/\/+$/, ''),
    deviceApiKey: env.GPS_DEVICE_API_KEY,
    registryCacheTtlMs: env.REGISTRY_CACHE_TTL_MS,
    forwardQueueMax: env.FORWARD_QUEUE_MAX,
    socketIdleTimeoutMs: env.SOCKET_IDLE_TIMEOUT_MS,
    speedUnit: env.SPEED_UNIT,
    logLevel: env.LOG_LEVEL,
    packetLogDir: env.PACKET_LOG_DIR,
    packetLogMaxBytes: env.PACKET_LOG_MAX_BYTES,
    packetLogRetryMs: env.PACKET_LOG_RETRY_MS,
    apiTimeoutMs: env.API_TIMEOUT_MS
  };
}
