# GPS Gateway (SinoTrack ST-901 / H02) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/gps-gateway` — a standalone TypeScript service that accepts raw TCP connections from SinoTrack ST-901 trackers, decodes the H02 protocol, resolves each device's IMEI to a vehicle, and forwards positions to the existing `POST /api/gps/ingest`.

**Architecture:** A protocol-adapter sidecar. Small, independently testable units: a **TCP server** (socket lifecycle + framing), a **pure H02 decoder** (`string → DecodedFrame`, no I/O), a **registry client** (IMEI → vehicleId via the API, TTL-cached), and an **ingest forwarder** (retry + bounded queue). The MMS API, database, dashboard, and the existing ESP32 firmware path are **unchanged** — the gateway is additive.

**Tech Stack:** TypeScript (ESM, NodeNext), Node 20 `net`, Zod (env validation), Vitest. No web framework, no database access.

**Plan set:** Plan 3 of 3 (spec: `docs/superpowers/specs/2026-07-11-gps-tracker-gateway-design.md`). Plan 1 (registry backend) and Plan 2 (admin UI) are **built and committed**.

## Global Constraints

- **TypeScript, ESM, NodeNext** — every relative import ends in `.js` (match `apps/api`).
- **No `any`** (prefer `unknown` + narrowing). `strict` + `noUncheckedIndexedAccess` are on (copy `apps/api/tsconfig.json`).
- **The gateway never touches the database.** All persistence goes through the MMS API. It is a pure adapter.
- **Backend contracts it consumes (already live, do not change):**
  - `GET {MMS_API_URL}/api/tracker-devices/resolve?deviceId=<imei>` with header `x-device-api-key` → `200 { vehicleId }` | `404` (unknown / inactive / unassigned) | `401` (bad key) | `500` (key unset). Also stamps `lastSeenAt`.
  - `POST {MMS_API_URL}/api/gps/ingest` with header `x-device-api-key`, body `{ vehicleId, tripId?, latitude, longitude, speed?, heading?, engineStatus? }`. `engineStatus` is free text — use `'on'` / `'off'`.
- **H02 text frame** (authoritative, per Traccar's `H02ProtocolDecoder`):
  `*HQ,<imei>,<type>,<hhmmss>,<A|V>,<ddmm.mmmm>,<N|S>,<dddmm.mmmm>,<E|W>,<speed>,<course>,<ddmmyy>,<8-hex status>[,<cell info>…]#`
  - `A` = valid fix, `V` = void (do **not** forward void fixes).
  - Latitude is `ddmm.mmmm`, longitude is `dddmm.mmmm` — the **last two digits before the dot are minutes**; `S`/`W` negate.
  - **Status bit 10 = ignition/ACC** (`(status >>> 10) & 1`). Use `>>>` — an 8-hex status exceeds int32.
  - Types: `V1`/`V5` = position; `V0`/`HTBT` = heartbeat; others (`NBR`, `LINK`, `VP1`, `V3`, `SMS`) and **binary `$`-prefixed frames** must be tolerated, never crash the connection.
- **Speed unit is firmware-dependent** — H02 conventionally sends **knots**. Expose `SPEED_UNIT` (`knots`|`kmh`, default `knots`) and convert knots → km/h (×1.852) so it matches the dashboard's km/h display. Confirm against the real device in Task 8.
- **Fail closed:** if `GPS_DEVICE_API_KEY` is missing, the gateway must refuse to start.
- Commit after each task on branch `production` with a targeted `git add` and a conventional-commit message. **No `Co-Authored-By`.** Do NOT create branches or push.

## ⚠️ Hardware dependency (read before starting)

The exact ST-901 frame variant **cannot be confirmed without the physical device** (firmware revisions differ — `V1` vs `V5`, field counts, speed units, ACC bit). This plan is therefore ordered so **Tasks 1–7 are fully buildable and testable today** against the documented format plus a simulator, and **Task 8 is the hardware-gated validation** that locks the decoder to real captured frames. Task 2 ships the capture tool early so you can capture the moment the SIM + device are ready.

---

## File Structure

All new files live under `apps/gps-gateway/`:

| File | Responsibility |
| --- | --- |
| `package.json` | Workspace app manifest (`@mms/gps-gateway`), scripts. |
| `tsconfig.json` / `tsconfig.build.json` | Types (copy `apps/api`'s). |
| `vitest.config.ts` | Node test env, `src/**/*.test.ts`. |
| `.env.example` | Documented env vars. |
| `src/config.ts` | Zod-validated env; fail fast on boot. |
| `src/capture.ts` | Standalone raw-TCP logger (hex + ascii) for capturing real device frames. |
| `src/h02.ts` | **Pure** H02 decoder: `decodeFrame(raw) → DecodedFrame`. No I/O. |
| `src/framing.ts` | `FrameBuffer` — turns a byte stream into complete `*…#` frames; drops binary/noise. |
| `src/tcp-server.ts` | Socket lifecycle: accept, frame, idle-timeout, hand frames to a handler. |
| `src/registry.ts` | IMEI → vehicleId via the API, with a TTL + negative cache. |
| `src/forwarder.ts` | Maps a decoded position → ingest JSON; POSTs with retry/backoff + bounded queue. |
| `src/gateway.ts` | Composition root: wires server → decoder → registry → forwarder. |
| `src/main.ts` | Entry point (`dotenv/config`, start). |
| `src/simulator.ts` | Replays H02 frames at the gateway for local/dashboard testing. |
| `deploy/gps-gateway.service` | systemd unit for the VPS. |
| `README.md` | What it is, env, running, **ST-901 SMS provisioning cheat-sheet**. |

---

### Task 1: Scaffold the `apps/gps-gateway` workspace app

**Files:**
- Create: `apps/gps-gateway/package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `.env.example`, `src/config.ts`, `src/config.test.ts`

**Interfaces:**
- Produces: `config` — `{ tcpPort, apiUrl, deviceApiKey, registryCacheTtlMs, forwardQueueMax, socketIdleTimeoutMs, speedUnit, logLevel }`.

- [ ] **Step 1: Write the failing config test**

Create `apps/gps-gateway/src/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

// Every case passes an explicit env object, so process.env is never touched.
const BASE = {
  MMS_API_URL: 'http://localhost:3001',
  GPS_DEVICE_API_KEY: 'test-device-key'
};

describe('gateway config', () => {
  it('applies defaults', () => {
    const config = loadConfig({ ...BASE });
    expect(config.tcpPort).toBe(5013);
    expect(config.apiUrl).toBe('http://localhost:3001');
    expect(config.speedUnit).toBe('knots');
    expect(config.registryCacheTtlMs).toBeGreaterThan(0);
  });

  it('fails closed when the device key is missing', () => {
    expect(() => loadConfig({ MMS_API_URL: 'http://localhost:3001' })).toThrow();
  });

  it('rejects an unknown speed unit', () => {
    expect(() => loadConfig({ ...BASE, SPEED_UNIT: 'furlongs' })).toThrow();
  });

  it('strips a trailing slash from the API url', () => {
    expect(loadConfig({ ...BASE, MMS_API_URL: 'http://x/' }).apiUrl).toBe('http://x');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run (from `apps/gps-gateway`): `pnpm test`
Expected: FAIL — `./config.js` does not exist.

- [ ] **Step 3: Create the manifest**

`apps/gps-gateway/package.json`:

```json
{
  "name": "@mms/gps-gateway",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "start": "node dist/main.js",
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run",
    "capture": "tsx src/capture.ts",
    "simulate": "tsx src/simulator.ts"
  },
  "dependencies": {
    "dotenv": "^17.4.2",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@types/node": "^24.9.2",
    "tsx": "^4.19.0",
    "typescript": "~5.9.3",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 4: Create the TypeScript + Vitest config**

`apps/gps-gateway/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "vitest.config.ts"]
}
```

`apps/gps-gateway/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "outDir": "dist", "rootDir": "src" },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

`apps/gps-gateway/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] }
});
```

- [ ] **Step 5: Write the config module**

`apps/gps-gateway/src/config.ts`:

```ts
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
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info')
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
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const env = envSchema.parse(source);
  return {
    tcpPort: env.GATEWAY_TCP_PORT,
    apiUrl: env.MMS_API_URL.replace(/\/+$/, ''),
    deviceApiKey: env.GPS_DEVICE_API_KEY,
    registryCacheTtlMs: env.REGISTRY_CACHE_TTL_MS,
    forwardQueueMax: env.FORWARD_QUEUE_MAX,
    socketIdleTimeoutMs: env.SOCKET_IDLE_TIMEOUT_MS,
    speedUnit: env.SPEED_UNIT,
    logLevel: env.LOG_LEVEL
  };
}
```

- [ ] **Step 6: Write `.env.example`**

`apps/gps-gateway/.env.example`:

```bash
# Port the ST-901 trackers dial into (must be open in the VPS firewall).
GATEWAY_TCP_PORT=5013
# Base URL of the MMS API.
MMS_API_URL=http://localhost:3001
# Same shared secret as the API's GPS_DEVICE_API_KEY.
GPS_DEVICE_API_KEY=dev-only-gps-device-key-0123456789abcdef
# How long an IMEI -> vehicle mapping is cached.
REGISTRY_CACHE_TTL_MS=300000
# Max positions buffered while the API is unreachable (oldest dropped past this).
FORWARD_QUEUE_MAX=1000
# Close a socket that has been silent this long.
SOCKET_IDLE_TIMEOUT_MS=600000
# H02 speed unit on the wire: knots (typical) or kmh. Confirm against the device.
SPEED_UNIT=knots
LOG_LEVEL=info
```

- [ ] **Step 7: Install and run the test**

Run (from repo root): `pnpm install`
Then (from `apps/gps-gateway`): `pnpm test && pnpm typecheck`
Expected: config tests PASS; typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add apps/gps-gateway pnpm-lock.yaml
git commit -m "feat(gateway): scaffold gps-gateway app with validated env config"
```

---

### Task 2: Capture tool (unblocks real-device capture the moment hardware arrives)

**Files:**
- Create: `apps/gps-gateway/src/capture.ts`

**Interfaces:**
- Produces: `pnpm --filter @mms/gps-gateway capture` — a raw TCP listener that logs every byte received (hex + printable ASCII) plus the peer address, to stdout and to `captures/<timestamp>.log`.

This is deliberately dumb: it does **not** decode. Point the tracker at it, let it report for a few minutes, and you have ground truth for Task 8.

- [ ] **Step 1: Write the capture tool**

`apps/gps-gateway/src/capture.ts`:

```ts
import 'dotenv/config';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

// Raw TCP logger. No decoding — this exists to capture EXACTLY what a real
// ST-901 puts on the wire, so the H02 decoder can be locked to reality.
const port = Number(process.env.GATEWAY_TCP_PORT ?? 5013);
const dir = path.resolve('captures');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `capture-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
const out = fs.createWriteStream(file, { flags: 'a' });

function write(line: string): void {
  process.stdout.write(`${line}\n`);
  out.write(`${line}\n`);
}

// Printable ASCII, with non-printables shown as '.', alongside the hex.
function render(chunk: Buffer): string {
  const hex = chunk.toString('hex').replace(/(.{2})/g, '$1 ').trim();
  const ascii = Array.from(chunk, (b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.')).join('');
  return `  hex   : ${hex}\n  ascii : ${ascii}`;
}

net
  .createServer((socket) => {
    const peer = `${socket.remoteAddress}:${socket.remotePort}`;
    write(`[${new Date().toISOString()}] CONNECT ${peer}`);
    socket.on('data', (chunk: Buffer) => {
      write(`[${new Date().toISOString()}] DATA ${peer} (${chunk.length} bytes)`);
      write(render(chunk));
    });
    socket.on('close', () => write(`[${new Date().toISOString()}] CLOSE ${peer}`));
    socket.on('error', (err) => write(`[${new Date().toISOString()}] ERROR ${peer}: ${err.message}`));
  })
  .listen(port, () => write(`capture listening on :${port} — writing to ${file}`));
```

- [ ] **Step 2: Verify it captures**

Terminal A (from `apps/gps-gateway`): `pnpm capture`
Terminal B: `printf '*HQ,1234567890,V1,084739,A,3123.4537,N,12112.3427,E,000.00,000,200420,FBFFB9FF,000,00,0,0#' | nc localhost 5013`
Expected: Terminal A prints `CONNECT`, a `DATA` line, and the hex + ascii of the frame; a file appears under `apps/gps-gateway/captures/`.

- [ ] **Step 3: Ignore capture output in git**

Append to the repo root `.gitignore`:

```
apps/gps-gateway/captures/
apps/gps-gateway/dist/
```

- [ ] **Step 4: Commit**

```bash
git add apps/gps-gateway/src/capture.ts .gitignore
git commit -m "feat(gateway): add raw TCP capture tool for real-device frames"
```

---

### Task 3: The H02 decoder (pure function)

**Files:**
- Create: `apps/gps-gateway/src/h02.ts`, `apps/gps-gateway/src/h02.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type DecodedFrame =
    | { kind: 'position'; deviceId: string; valid: boolean; latitude: number; longitude: number;
        speedKmh: number | null; heading: number | null; ignition: boolean | null; fixTime: Date | null; raw: string }
    | { kind: 'heartbeat'; deviceId: string; raw: string }
    | { kind: 'unknown'; raw: string };
  export function decodeFrame(raw: string, speedUnit: 'knots' | 'kmh'): DecodedFrame;
  ```

- [ ] **Step 1: Write the failing decoder tests**

Create `apps/gps-gateway/src/h02.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decodeFrame } from './h02.js';

// A representative ST-901 position frame (documented H02 layout).
const POSITION =
  '*HQ,1234567890,V1,084739,A,3123.4537,N,12112.3427,E,010.00,090,200420,FFFFFDFF,000,00,0,0#';

describe('decodeFrame', () => {
  it('decodes a valid position, converting ddmm.mmmm to decimal degrees', () => {
    const frame = decodeFrame(POSITION, 'knots');
    expect(frame.kind).toBe('position');
    if (frame.kind !== 'position') return;
    expect(frame.deviceId).toBe('1234567890');
    expect(frame.valid).toBe(true);
    expect(frame.latitude).toBeCloseTo(31.390895, 5);
    expect(frame.longitude).toBeCloseTo(121.205712, 5);
    expect(frame.heading).toBe(90);
    // 10 knots -> km/h
    expect(frame.speedKmh).toBeCloseTo(18.52, 2);
    expect(frame.fixTime?.toISOString()).toBe('2020-04-20T08:47:39.000Z');
  });

  it('treats the speed as km/h when configured that way', () => {
    const frame = decodeFrame(POSITION, 'kmh');
    if (frame.kind !== 'position') throw new Error('expected position');
    expect(frame.speedKmh).toBeCloseTo(10, 5);
  });

  it('negates southern and western hemispheres', () => {
    const raw = POSITION.replace(',N,', ',S,').replace(',E,', ',W,');
    const frame = decodeFrame(raw, 'knots');
    if (frame.kind !== 'position') throw new Error('expected position');
    expect(frame.latitude).toBeCloseTo(-31.390895, 5);
    expect(frame.longitude).toBeCloseTo(-121.205712, 5);
  });

  it('marks a void fix (V) as invalid', () => {
    const frame = decodeFrame(POSITION.replace(',A,', ',V,'), 'knots');
    if (frame.kind !== 'position') throw new Error('expected position');
    expect(frame.valid).toBe(false);
  });

  it('reads ignition from bit 10 of the status word', () => {
    // bit 10 set -> ignition on. 0x00000400 == bit 10.
    const on = decodeFrame(POSITION.replace(',FFFFFDFF,', ',00000400,'), 'knots');
    if (on.kind !== 'position') throw new Error('expected position');
    expect(on.ignition).toBe(true);

    const off = decodeFrame(POSITION.replace(',FFFFFDFF,', ',00000000,'), 'knots');
    if (off.kind !== 'position') throw new Error('expected position');
    expect(off.ignition).toBe(false);
  });

  it('uses unsigned shifting so a high status word still parses', () => {
    // 0xFFFFFFFF has bit 10 set; a signed >> would still work here, but the
    // decoder must not produce NaN/garbage for a full 32-bit status.
    const frame = decodeFrame(POSITION.replace(',FFFFFDFF,', ',FFFFFFFF,'), 'knots');
    if (frame.kind !== 'position') throw new Error('expected position');
    expect(frame.ignition).toBe(true);
  });

  it('recognises heartbeats', () => {
    const frame = decodeFrame('*HQ,1234567890,V0,084739#', 'knots');
    expect(frame.kind).toBe('heartbeat');
    if (frame.kind !== 'heartbeat') return;
    expect(frame.deviceId).toBe('1234567890');
  });

  it('returns unknown for other message types and malformed input', () => {
    expect(decodeFrame('*HQ,1234567890,LINK,084739,1,2,3#', 'knots').kind).toBe('unknown');
    expect(decodeFrame('garbage', 'knots').kind).toBe('unknown');
    expect(decodeFrame('*HQ,123,V1,084739,A#', 'knots').kind).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm test src/h02.test.ts`
Expected: FAIL — `./h02.js` does not exist.

- [ ] **Step 3: Implement the decoder**

`apps/gps-gateway/src/h02.ts`:

```ts
export type DecodedFrame =
  | {
      kind: 'position';
      deviceId: string;
      valid: boolean;
      latitude: number;
      longitude: number;
      speedKmh: number | null;
      heading: number | null;
      ignition: boolean | null;
      fixTime: Date | null;
      raw: string;
    }
  | { kind: 'heartbeat'; deviceId: string; raw: string }
  | { kind: 'unknown'; raw: string };

const KNOTS_TO_KMH = 1.852;
const POSITION_TYPES = new Set(['V1', 'V5']);
const HEARTBEAT_TYPES = new Set(['V0', 'HTBT']);

// `ddmm.mmmm` / `dddmm.mmmm` — the last two digits BEFORE the dot are minutes.
function dmToDecimal(value: string, hemisphere: string): number | null {
  const dot = value.indexOf('.');
  const intPart = dot === -1 ? value : value.slice(0, dot);
  if (intPart.length < 3) return null;
  const degrees = Number(intPart.slice(0, intPart.length - 2));
  const minutes = Number(value.slice(intPart.length - 2));
  if (!Number.isFinite(degrees) || !Number.isFinite(minutes)) return null;
  const decimal = degrees + minutes / 60;
  return hemisphere === 'S' || hemisphere === 'W' ? -decimal : decimal;
}

// Status is 8 hex chars (32 bits) — use >>> so it is treated as unsigned.
function ignitionFromStatus(statusHex: string): boolean | null {
  const status = Number.parseInt(statusHex, 16);
  if (!Number.isFinite(status)) return null;
  return ((status >>> 10) & 1) === 1;
}

function parseFixTime(hhmmss: string, ddmmyy: string): Date | null {
  if (hhmmss.length < 6 || ddmmyy.length < 6) return null;
  const hh = Number(hhmmss.slice(0, 2));
  const mi = Number(hhmmss.slice(2, 4));
  const ss = Number(hhmmss.slice(4, 6));
  const dd = Number(ddmmyy.slice(0, 2));
  const mo = Number(ddmmyy.slice(2, 4));
  const yy = Number(ddmmyy.slice(4, 6));
  if ([hh, mi, ss, dd, mo, yy].some((n) => !Number.isFinite(n))) return null;
  const ms = Date.UTC(2000 + yy, mo - 1, dd, hh, mi, ss);
  return Number.isNaN(ms) ? null : new Date(ms);
}

function toNumberOrNull(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Decodes one H02 text frame: `*HQ,<imei>,<type>,<hhmmss>,<A|V>,<lat>,<N|S>,<lon>,<E|W>,<speed>,<course>,<ddmmyy>,<status>[,...]#`
 * Pure: no I/O, no state. Anything it cannot confidently parse is `unknown`.
 */
export function decodeFrame(raw: string, speedUnit: 'knots' | 'kmh'): DecodedFrame {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('*') || !trimmed.endsWith('#')) return { kind: 'unknown', raw };

  const parts = trimmed.slice(1, -1).split(',');
  const deviceId = parts[1];
  const type = parts[2];
  if (!deviceId || !type) return { kind: 'unknown', raw };

  if (HEARTBEAT_TYPES.has(type)) return { kind: 'heartbeat', deviceId, raw };
  if (!POSITION_TYPES.has(type)) return { kind: 'unknown', raw };

  const [, , , time, validity, lat, ns, lon, ew, speed, course, date, status] = parts;
  if (!time || !validity || !lat || !ns || !lon || !ew || !date) return { kind: 'unknown', raw };

  const latitude = dmToDecimal(lat, ns);
  const longitude = dmToDecimal(lon, ew);
  if (latitude === null || longitude === null) return { kind: 'unknown', raw };

  const rawSpeed = toNumberOrNull(speed);
  const speedKmh =
    rawSpeed === null ? null : speedUnit === 'knots' ? rawSpeed * KNOTS_TO_KMH : rawSpeed;

  return {
    kind: 'position',
    deviceId,
    valid: validity === 'A',
    latitude,
    longitude,
    speedKmh,
    heading: toNumberOrNull(course),
    ignition: status ? ignitionFromStatus(status) : null,
    fixTime: parseFixTime(time, date),
    raw
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test src/h02.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add apps/gps-gateway/src/h02.ts apps/gps-gateway/src/h02.test.ts
git commit -m "feat(gateway): add pure H02 frame decoder with tests"
```

---

### Task 4: Frame buffering + the TCP server

**Files:**
- Create: `apps/gps-gateway/src/framing.ts`, `src/framing.test.ts`, `src/tcp-server.ts`, `src/tcp-server.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export class FrameBuffer { push(chunk: Buffer): string[]; }
  export interface TcpServerOptions { port: number; idleTimeoutMs: number; onFrame: (raw: string, peer: string) => void; }
  export function startTcpServer(options: TcpServerOptions): Promise<import('node:net').Server>;
  ```

- [ ] **Step 1: Write the failing framing tests**

Create `apps/gps-gateway/src/framing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FrameBuffer } from './framing.js';

const A = '*HQ,1,V1,a#';
const B = '*HQ,2,V1,b#';

describe('FrameBuffer', () => {
  it('emits a whole frame', () => {
    expect(new FrameBuffer().push(Buffer.from(A))).toEqual([A]);
  });

  it('reassembles a frame split across chunks', () => {
    const buf = new FrameBuffer();
    expect(buf.push(Buffer.from('*HQ,1,V1'))).toEqual([]);
    expect(buf.push(Buffer.from(',a#'))).toEqual([A]);
  });

  it('emits multiple frames arriving in one chunk', () => {
    expect(new FrameBuffer().push(Buffer.from(A + B))).toEqual([A, B]);
  });

  it('drops leading binary/noise before the next frame', () => {
    const noise = Buffer.from([0x24, 0x01, 0x02, 0xff]); // a binary '$' frame
    expect(new FrameBuffer().push(Buffer.concat([noise, Buffer.from(A)]))).toEqual([A]);
  });

  it('does not grow without bound on garbage', () => {
    const buf = new FrameBuffer(16);
    expect(buf.push(Buffer.from('x'.repeat(64)))).toEqual([]);
    expect(buf.push(Buffer.from(A))).toEqual([A]);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm test src/framing.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement the frame buffer**

`apps/gps-gateway/src/framing.ts`:

```ts
const DEFAULT_MAX_BUFFER = 8192;

/**
 * Turns a TCP byte stream into complete `*…#` H02 text frames.
 * Bytes before a `*` (e.g. the device's interleaved binary frames) are dropped —
 * we deliberately do not decode the binary variant.
 */
export class FrameBuffer {
  private buffer = '';

  constructor(private readonly maxBuffer: number = DEFAULT_MAX_BUFFER) {}

  push(chunk: Buffer): string[] {
    // latin1 keeps every byte 1:1 so binary noise cannot corrupt the string.
    this.buffer += chunk.toString('latin1');
    const frames: string[] = [];

    for (;;) {
      const start = this.buffer.indexOf('*');
      if (start === -1) {
        if (this.buffer.length > this.maxBuffer) this.buffer = '';
        break;
      }
      if (start > 0) this.buffer = this.buffer.slice(start);

      const end = this.buffer.indexOf('#');
      if (end === -1) {
        if (this.buffer.length > this.maxBuffer) this.buffer = '';
        break;
      }
      frames.push(this.buffer.slice(0, end + 1));
      this.buffer = this.buffer.slice(end + 1);
    }
    return frames;
  }
}
```

- [ ] **Step 4: Write the failing TCP server test**

Create `apps/gps-gateway/src/tcp-server.test.ts`:

```ts
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
```

- [ ] **Step 5: Run and watch it fail**

Run: `pnpm test src/tcp-server.test.ts` → FAIL (module missing).

- [ ] **Step 6: Implement the TCP server**

`apps/gps-gateway/src/tcp-server.ts`:

```ts
import net from 'node:net';
import { FrameBuffer } from './framing.js';

export interface TcpServerOptions {
  port: number;
  idleTimeoutMs: number;
  onFrame: (raw: string, peer: string) => void;
  onError?: (error: Error, peer: string) => void;
}

/**
 * Owns the socket lifecycle. Each connection gets its own FrameBuffer; complete
 * frames go to `onFrame`. A silent socket is closed after `idleTimeoutMs` —
 * the tracker reconnects on its own.
 */
export function startTcpServer(options: TcpServerOptions): Promise<net.Server> {
  const server = net.createServer((socket) => {
    const peer = `${socket.remoteAddress ?? '?'}:${socket.remotePort ?? '?'}`;
    const frames = new FrameBuffer();

    socket.setTimeout(options.idleTimeoutMs, () => socket.destroy());
    socket.on('data', (chunk: Buffer) => {
      for (const raw of frames.push(chunk)) options.onFrame(raw, peer);
    });
    socket.on('error', (error) => options.onError?.(error, peer));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, () => resolve(server));
  });
}
```

- [ ] **Step 7: Run both test files**

Run: `pnpm test`
Expected: PASS (config + h02 + framing + tcp-server).

- [ ] **Step 8: Commit**

```bash
git add apps/gps-gateway/src/framing.ts apps/gps-gateway/src/framing.test.ts apps/gps-gateway/src/tcp-server.ts apps/gps-gateway/src/tcp-server.test.ts
git commit -m "feat(gateway): add frame buffering and the TCP server"
```

---

### Task 5: Registry client + ingest forwarder

**Files:**
- Create: `apps/gps-gateway/src/registry.ts`, `src/registry.test.ts`, `src/forwarder.ts`, `src/forwarder.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Registry { resolve(deviceId: string): Promise<string | null>; }
  export function createRegistry(config: GatewayConfig): Registry;

  export interface Forwarder { send(vehicleId: string, frame: PositionFrame): Promise<void>; }
  export function createForwarder(config: GatewayConfig): Forwarder;
  ```
  (`PositionFrame` = the `kind: 'position'` member of `DecodedFrame`.)

- [ ] **Step 1: Write the failing registry test**

Create `apps/gps-gateway/src/registry.test.ts`:

```ts
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { createRegistry } from './registry.js';

let server: http.Server | null = null;

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
});

async function stubApi(handler: http.RequestListener): Promise<string> {
  server = http.createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('registry', () => {
  it('resolves an IMEI to a vehicle id and caches it', async () => {
    let calls = 0;
    const url = await stubApi((req, res) => {
      calls += 1;
      expect(req.headers['x-device-api-key']).toBe('k');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ vehicleId: 'veh-1' }));
    });
    const registry = createRegistry(loadConfig({ MMS_API_URL: url, GPS_DEVICE_API_KEY: 'k' }));

    expect(await registry.resolve('imei-1')).toBe('veh-1');
    expect(await registry.resolve('imei-1')).toBe('veh-1');
    expect(calls).toBe(1); // second call served from cache
  });

  it('returns null for an unknown device and caches the negative result', async () => {
    let calls = 0;
    const url = await stubApi((_req, res) => {
      calls += 1;
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'DEVICE_NOT_FOUND' } }));
    });
    const registry = createRegistry(loadConfig({ MMS_API_URL: url, GPS_DEVICE_API_KEY: 'k' }));

    expect(await registry.resolve('nope')).toBeNull();
    expect(await registry.resolve('nope')).toBeNull();
    expect(calls).toBe(1);
  });

  it('does not cache a transient server error', async () => {
    let calls = 0;
    const url = await stubApi((_req, res) => {
      calls += 1;
      res.writeHead(500);
      res.end();
    });
    const registry = createRegistry(loadConfig({ MMS_API_URL: url, GPS_DEVICE_API_KEY: 'k' }));

    expect(await registry.resolve('x')).toBeNull();
    expect(await registry.resolve('x')).toBeNull();
    expect(calls).toBe(2);
  });
});
```

- [ ] **Step 2: Run and watch it fail** — `pnpm test src/registry.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement the registry client**

`apps/gps-gateway/src/registry.ts`:

```ts
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
        response = await fetch(url, { headers: { 'x-device-api-key': config.deviceApiKey } });
      } catch {
        return null; // network blip — do not cache
      }

      if (response.status === 404) {
        // Unknown / inactive / unassigned: a stable "no" worth caching.
        cache.set(deviceId, { vehicleId: null, expiresAt: Date.now() + config.registryCacheTtlMs });
        return null;
      }
      if (!response.ok) return null; // 401/500 — misconfiguration or outage; do not cache

      const body = (await response.json()) as { vehicleId?: unknown };
      const vehicleId = typeof body.vehicleId === 'string' ? body.vehicleId : null;
      cache.set(deviceId, { vehicleId, expiresAt: Date.now() + config.registryCacheTtlMs });
      return vehicleId;
    }
  };
}
```

- [ ] **Step 4: Write the failing forwarder test**

Create `apps/gps-gateway/src/forwarder.test.ts`:

```ts
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { createForwarder } from './forwarder.js';
import type { DecodedFrame } from './h02.js';

let server: http.Server | null = null;

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
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
        res.end('{}');
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const forwarder = createForwarder(loadConfig({ MMS_API_URL: url, GPS_DEVICE_API_KEY: 'k' }));
    await forwarder.send('veh-1', position);

    expect(bodies).toEqual([
      {
        vehicleId: 'veh-1',
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
        res.end('{}');
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const forwarder = createForwarder(loadConfig({ MMS_API_URL: url, GPS_DEVICE_API_KEY: 'k' }));
    await forwarder.send('veh-1', { ...position, ignition: false });

    expect(bodies[0]?.engineStatus).toBe('off');
  });

  it('retries a failing POST and eventually succeeds', async () => {
    let attempts = 0;
    server = http.createServer((_req, res) => {
      attempts += 1;
      res.writeHead(attempts < 3 ? 500 : 200);
      res.end('{}');
    });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const forwarder = createForwarder(loadConfig({ MMS_API_URL: url, GPS_DEVICE_API_KEY: 'k' }));
    await forwarder.send('veh-1', position);

    expect(attempts).toBe(3);
  });
});
```

- [ ] **Step 5: Run and watch it fail** — `pnpm test src/forwarder.test.ts` → FAIL (module missing).

- [ ] **Step 6: Implement the forwarder**

`apps/gps-gateway/src/forwarder.ts`:

```ts
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
```

- [ ] **Step 7: Run the tests** — `pnpm test` → PASS (all files).

- [ ] **Step 8: Commit**

```bash
git add apps/gps-gateway/src/registry.ts apps/gps-gateway/src/registry.test.ts apps/gps-gateway/src/forwarder.ts apps/gps-gateway/src/forwarder.test.ts
git commit -m "feat(gateway): add registry client and ingest forwarder"
```

---

### Task 6: Wire it together + a device simulator

**Files:**
- Create: `apps/gps-gateway/src/gateway.ts`, `src/gateway.test.ts`, `src/main.ts`, `src/simulator.ts`

**Interfaces:**
- Consumes: `loadConfig`, `decodeFrame`, `startTcpServer`, `createRegistry`, `createForwarder`.
- Produces: `startGateway(config, deps?) → Promise<net.Server>`.

- [ ] **Step 1: Write the failing end-to-end gateway test**

Create `apps/gps-gateway/src/gateway.test.ts`:

```ts
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
```

- [ ] **Step 2: Run and watch it fail** — `pnpm test src/gateway.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement the composition root**

`apps/gps-gateway/src/gateway.ts`:

```ts
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
```

- [ ] **Step 4: Write the entry point**

`apps/gps-gateway/src/main.ts`:

```ts
import 'dotenv/config';
import { loadConfig } from './config.js';
import { startGateway } from './gateway.js';

const config = loadConfig();
void startGateway(config).then(() => {
  console.log(`GPS gateway listening on tcp/${config.tcpPort} → ${config.apiUrl}`);
});
```

- [ ] **Step 5: Write the simulator**

`apps/gps-gateway/src/simulator.ts`:

```ts
import 'dotenv/config';
import net from 'node:net';

// Replays H02 position frames at the gateway so the whole pipeline (and the
// dashboard map) can be exercised without the physical tracker.
// Usage: pnpm --filter @mms/gps-gateway simulate <imei> [host] [port]
const imei = process.argv[2] ?? '1234567890';
const host = process.argv[3] ?? '127.0.0.1';
const port = Number(process.argv[4] ?? process.env.GATEWAY_TCP_PORT ?? 5013);

// A short drive through Davao City (matches the dashboard's map centre).
const route = [
  [7.0731, 125.6128],
  [7.0745, 125.6142],
  [7.076, 125.6155],
  [7.078, 125.617],
  [7.08, 125.619]
] as const;

// decimal degrees -> ddmm.mmmm / dddmm.mmmm
function toDm(value: number, degreeDigits: number): string {
  const abs = Math.abs(value);
  const degrees = Math.floor(abs);
  const minutes = (abs - degrees) * 60;
  return `${String(degrees).padStart(degreeDigits, '0')}${minutes.toFixed(4).padStart(7, '0')}`;
}

function frameFor(lat: number, lon: number): string {
  const now = new Date();
  const hhmmss =
    String(now.getUTCHours()).padStart(2, '0') +
    String(now.getUTCMinutes()).padStart(2, '0') +
    String(now.getUTCSeconds()).padStart(2, '0');
  const ddmmyy =
    String(now.getUTCDate()).padStart(2, '0') +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCFullYear() % 100).padStart(2, '0');
  // status 00000400 == bit 10 set == ignition ON
  return `*HQ,${imei},V1,${hhmmss},A,${toDm(lat, 2)},N,${toDm(lon, 3)},E,020.00,090,${ddmmyy},00000400,000,00,0,0#`;
}

const socket = net.createConnection({ host, port }, () => {
  console.log(`simulator connected to ${host}:${port} as ${imei}`);
  let i = 0;
  setInterval(() => {
    const point = route[i % route.length];
    if (!point) return;
    const frame = frameFor(point[0], point[1]);
    socket.write(frame);
    console.log(`sent ${frame}`);
    i += 1;
  }, 3000);
});
socket.on('error', (error) => console.error('simulator error:', error.message));
```

- [ ] **Step 6: Run the full suite**

Run (from `apps/gps-gateway`): `pnpm test && pnpm typecheck && pnpm build`
Expected: all tests PASS; typecheck and build clean.

- [ ] **Step 7: Manual smoke against the real API (optional but recommended)**

With the MMS stack running (`pnpm dev` from the repo root, API on :3001) and a tracker device registered in the Trackers admin UI with IMEI `1234567890` assigned to a vehicle:

```bash
# terminal A
pnpm --filter @mms/gps-gateway dev
# terminal B
pnpm --filter @mms/gps-gateway simulate 1234567890
```
Expected: the gateway logs forwards; the vehicle moves on the dashboard map; `GET /api/gps/latest` shows the new points.

- [ ] **Step 8: Commit**

```bash
git add apps/gps-gateway/src/gateway.ts apps/gps-gateway/src/gateway.test.ts apps/gps-gateway/src/main.ts apps/gps-gateway/src/simulator.ts
git commit -m "feat(gateway): wire the pipeline and add a device simulator"
```

---

### Task 7: Deployment unit + documentation

**Files:**
- Create: `apps/gps-gateway/deploy/gps-gateway.service`, `apps/gps-gateway/README.md`
- Modify: `README.md` (root, §12), `docs/DEVELOPER_GUIDE.md`, `tools/firmware/` (a note)

- [ ] **Step 1: Write the systemd unit**

`apps/gps-gateway/deploy/gps-gateway.service`:

```ini
[Unit]
Description=MMS GPS Gateway (SinoTrack ST-901 / H02)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/mms/gps-gateway
EnvironmentFile=/opt/mms/gps-gateway/.env
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=5
User=mms
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Write the gateway README (including the SMS cheat-sheet)**

`apps/gps-gateway/README.md`:

```markdown
# MMS GPS Gateway (SinoTrack ST-901 / H02)

A standalone TCP service that receives H02 frames from SinoTrack ST-901 trackers,
resolves each device's IMEI to a vehicle, and forwards positions to the MMS API's
`POST /api/gps/ingest`. It never touches the database.

    ST-901 --2G/TCP--> gateway --HTTPS--> MMS API --> Postgres --> dashboard

## Why a gateway?

The ST-901 is a sealed 2G device. It cannot run custom firmware and does not speak
HTTP/JSON — it opens a raw TCP socket to a server you configure by SMS and streams
the manufacturer's H02 protocol, identifying itself by IMEI. The gateway translates.

## Configuration

Copy `.env.example` to `.env`. Every variable is documented there. The two that matter:

- `MMS_API_URL` — where the MMS API lives.
- `GPS_DEVICE_API_KEY` — must equal the API's `GPS_DEVICE_API_KEY`. **The gateway refuses to start without it.**

`SPEED_UNIT` (`knots` by default) exists because H02 speed units are firmware-dependent —
confirm it against your device (see Capturing below) before trusting the dashboard's km/h.

## Running

    pnpm --filter @mms/gps-gateway dev        # watch mode
    pnpm --filter @mms/gps-gateway build && pnpm --filter @mms/gps-gateway start

Test the whole pipeline without hardware:

    pnpm --filter @mms/gps-gateway simulate <imei>

(Register that IMEI in the Trackers admin screen and assign it to a vehicle first, or
the gateway will correctly drop the frames as unregistered.)

## Capturing real device frames

ST-901 firmware revisions differ (`V1` vs `V5` message types, field counts, speed units).
Before trusting the decoder against a new device, capture what it actually sends:

    pnpm --filter @mms/gps-gateway capture

Point the tracker at that port, let it report for a few minutes, and inspect
`captures/*.log` (hex + ascii). Add real frames to `src/h02.test.ts` as fixtures.

## Deploying (Oracle Cloud "Always Free" VPS)

1. Install Node 20, clone the repo, `pnpm install`, `pnpm --filter @mms/gps-gateway build`.
2. Copy the build to `/opt/mms/gps-gateway` and create `/opt/mms/gps-gateway/.env`.
3. Install the unit: `cp deploy/gps-gateway.service /etc/systemd/system/` then
   `systemctl enable --now gps-gateway`.
4. Open the TCP port **in both** the VM firewall (`ufw allow 5013/tcp`) and the Oracle
   security list — Oracle blocks by default at the cloud layer even if the VM allows it.
5. `journalctl -u gps-gateway -f` to watch it.

## Provisioning an ST-901 (SMS cheat-sheet)

Insert an activated **2G data SIM**, power the device, then SMS these to the SIM
(default password is `0000` on most units — check your device's manual, commands vary
by firmware):

| Purpose | SMS |
| --- | --- |
| Check status / IMEI | `CHECK#` (or `STATUS#`) |
| Set the APN | `APN,<apn>,<user>,<pass>#` |
| Point it at the gateway | `SERVER,1,<gateway-public-ip>,<port>,0#` |
| Set the reporting interval | `TIMER,<seconds>#` |
| Factory reset | `FACTORY#` / `RESET#` |

Then register the device's **IMEI** in the MMS Trackers admin screen and assign it to a
vehicle. Confirm with `journalctl -u gps-gateway -f` that frames arrive and forward.

> ⚠️ **2G is being switched off in many countries.** Confirm your carrier still runs a
> 2G network before buying more of these devices.
```

- [ ] **Step 3: Update the root README (functional guide, §12)**

In `README.md`, inside §12 "Live GPS tracking and the map", add after the "Where the dots come from" bullet:

```markdown
- **The physical trackers.** Vehicles are fitted with **SinoTrack ST-901** GPS trackers (2G). Each one reports over the mobile network to a small **gateway** service, which looks up which vehicle that tracker belongs to (from the Trackers registry) and feeds its position into the system. If a tracker isn't registered — or isn't assigned to a vehicle — its reports are ignored.
```

- [ ] **Step 4: Update the developer guide**

In `docs/DEVELOPER_GUIDE.md`, add `apps/gps-gateway` to the **Monorepo layout** table:

```markdown
| `apps/gps-gateway` | TCP service that decodes SinoTrack ST-901 (H02) frames and forwards them to `POST /api/gps/ingest`. See its own README. |
```

And add a short section after the GPS endpoints:

```markdown
### GPS gateway

Physical ST-901 trackers cannot call the API directly (raw TCP, H02 protocol, IMEI identity), so `apps/gps-gateway` receives them and forwards to `POST /api/gps/ingest`. It authenticates to the API with the same `GPS_DEVICE_API_KEY`, and resolves IMEI → vehicle via `GET /api/tracker-devices/resolve`. Its env vars (`GATEWAY_TCP_PORT`, `MMS_API_URL`, `SPEED_UNIT`, …) are documented in `apps/gps-gateway/.env.example`.
```

- [ ] **Step 5: Distinguish the two device paths in the firmware folder**

Create `tools/firmware/README.md`:

```markdown
# Firmware / device paths

There are two, and they are different:

- **`gps_esp32_supabase.ino` / `gpsTst.ino` — the custom ESP32 tracker.** A DIY device
  (ESP32 + NEO-6M) running our own code over **WiFi**, POSTing JSON straight to
  `POST /api/gps/ingest` with a hardcoded vehicle UUID. Prototype/demo path.

- **SinoTrack ST-901 — the off-the-shelf tracker.** A sealed **2G** device. It cannot run
  custom firmware and does not speak HTTP/JSON: it opens a raw TCP socket and streams the
  H02 protocol, identified by IMEI. It talks to `apps/gps-gateway`, which translates and
  forwards to the same ingest endpoint.

Both paths end at the same door (`/api/gps/ingest`); only the ESP32 one involves firmware
you can edit.
```

- [ ] **Step 6: Commit**

```bash
git add apps/gps-gateway/deploy apps/gps-gateway/README.md README.md docs/DEVELOPER_GUIDE.md tools/firmware/README.md
git commit -m "docs(gateway): add deployment unit, gateway README, and device-path docs"
```

---

### Task 8: 🔌 HARDWARE-GATED — validate against the real ST-901

> **Do not start this task until you physically have:** the ST-901, an **activated 2G data SIM**, and a **publicly reachable host** (the VPS) with the gateway's TCP port open. Everything above is already done and tested without hardware; this task replaces assumptions with reality.

**Files:**
- Modify: `apps/gps-gateway/src/h02.test.ts` (add real captured frames as fixtures), and `src/h02.ts` / `.env` only if the capture proves them wrong.

- [ ] **Step 1: Confirm 2G coverage**

Verify with the SIM's carrier that a **2G/GPRS** data network is still operating in your area. If it is not, STOP — this device cannot work, and no amount of code fixes it.

- [ ] **Step 2: Capture real frames**

On the VPS: `pnpm --filter @mms/gps-gateway capture` (with `GATEWAY_TCP_PORT` open).
Provision the device by SMS to point at that public IP + port (see the gateway README cheat-sheet).
Let it report for at least 10 minutes, moving if possible, with the ignition both **on and off**.

- [ ] **Step 3: Compare reality against the decoder's assumptions**

From `captures/*.log`, confirm each of these. Record the answers:

1. **Message type** — is it `V1`, or `V5`, or something else? (`POSITION_TYPES` in `src/h02.ts`.)
2. **Field order/count** — does it match `*HQ,<imei>,<type>,<hhmmss>,<A|V>,<lat>,<N|S>,<lon>,<E|W>,<speed>,<course>,<ddmmyy>,<status>…#`?
3. **Device id** — is the id it sends the full IMEI, or a variant? (This is what you register in the Trackers screen.)
4. **Speed unit** — drive at a known speed; if the decoded km/h reads ~1.85× too high, the wire value was already km/h → set `SPEED_UNIT=kmh`.
5. **ACC/ignition** — capture with ignition ON and OFF and diff the status hex. Confirm **bit 10** is the one that flips. If it isn't, fix `ignitionFromStatus`.
6. **Binary frames** — confirm the `$`-prefixed binary frames are being harmlessly dropped by `FrameBuffer` (they should never reach the decoder).

- [ ] **Step 4: Lock the decoder to reality (TDD)**

Add the **real captured frames** as fixtures in `src/h02.test.ts` — at minimum one ignition-on position, one ignition-off position, one void fix, and one heartbeat, pasted verbatim from the capture. Run the tests: any that fail are the decoder's assumptions being corrected by reality. Fix `src/h02.ts` until they pass.

Run: `pnpm test src/h02.test.ts` → PASS with real frames.

- [ ] **Step 5: End-to-end proof**

Register the device's real IMEI in the **Trackers** admin screen, assign it to a vehicle, and run the gateway (not the capture tool) on the VPS. Drive the vehicle.

Verify: the vehicle moves on the **dashboard map**; `GET /api/gps/history?vehicleId=…` returns the points; the Trackers list shows the device **Online**; `engineStatus` flips with the ignition.

- [ ] **Step 6: Commit the reality fixes**

```bash
git add apps/gps-gateway/src/h02.ts apps/gps-gateway/src/h02.test.ts apps/gps-gateway/README.md
git commit -m "fix(gateway): lock the H02 decoder to real ST-901 captured frames"
```

---

## Self-Review

| Spec requirement | Task |
| --- | --- |
| §5 components: TCP server, pure decoder, registry client, forwarder, composition root | Tasks 3, 4, 5, 6 |
| §6 field mapping (ddmm.mmmm → decimal, A/V, knots→km/h, ACC→engineStatus, timestamp) | Task 3 (+ Task 8 confirms) |
| §8 configuration (env vars, fail-closed device key) | Task 1 |
| §9 reliability (void fixes dropped, heartbeats refresh liveness, retry/backoff, idle timeout, malformed frames never crash) | Tasks 3–6 |
| §10 security (device key never exposed; only registered+active IMEIs resolve; one open port) | Tasks 5, 6, 7 |
| §11 deployment + SMS provisioning | Task 7 |
| §12 testing (decoder units, forwarder, registry, integration, simulator) | Tasks 3–6 |
| §13 docs (gateway README, root README, DEVELOPER_GUIDE, firmware note) | Task 7 |
| §14 risk: exact packet format unconfirmed | **Task 8** (explicitly hardware-gated) |

**Docs scope (spec §13):** the `DEVELOPER_GUIDE.md` **tracker-devices endpoint** section is owned by Plan 1 (done); the root-README **Trackers admin area** section is owned by Plan 2 (done); this plan owns the **gateway README**, the root-README **physical-tracker** bullet, the DEVELOPER_GUIDE **gateway** section, and the **`tools/firmware`** note.

**Known deliberate gaps:** the forwarder retries but does not yet persist a disk-backed queue across restarts (spec §9 allows a bounded in-memory queue; `FORWARD_QUEUE_MAX` is wired in config for when it's needed). The FE's online/offline threshold is an independent display heuristic and is not linked to the gateway's config — noted in Plan 2 and acceptable.
