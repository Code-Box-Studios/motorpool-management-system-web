# Backend Migration Plan 6/7: GPS Tracking + Analytics & ML

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The GPS and analytics/ML surface on the Plan 1–5 foundation: GPS ingest (device-key, **fail-closed**), `/gps/latest` (newest point per vehicle via SQL `DISTINCT ON`), `/gps/history`; and analytics — the dashboard metric counts, predictive-maintenance risk scoring (Random Forest inference ported from the committed JSON model, with a rule-based fallback), and spare-parts association-rule mining (Apriori). The client-side ML + the retired Flask API are replaced by one server implementation.

**Architecture:** Feature modules per spec §6 (`router → controller → service → repository`). The ML/analytics computations are **pure functions in `apps/api/src/lib/ml/`** — feature extraction, RF traversal, fallback scoring, risk classification, and Apriori — unit-tested against golden values so the port is provably faithful (spec §13). The services query Prisma and call these pure functions; the endpoints are thin. The Random Forest model JSON becomes a private API asset loaded ONCE at module init.

**Tech Stack:** Express 5, Prisma, Zod contracts in `@mms/shared`, Vitest + Supertest against `mms_test`. Raw SQL (`prisma.$queryRaw`) for the `DISTINCT ON` latest-per-vehicle query.

**Spec:** `docs/superpowers/specs/2026-07-03-express-backend-migration-design.md` §5 (read matrix: gps/analytics = admin + evp_operations only), §6 (module table: gps + analytics rows + response conventions), §10 (GPS & tracking), §11 (analytics & ML). Prior work: Plans 1–5.

## Global Constraints

- TypeScript strict; no `any`; `noUncheckedIndexedAccess` on. **NodeNext ESM: every relative import in `apps/api` and `packages/shared` carries `.js`.**
- Error envelope `{ error: { code, message, details? } }`. Codes added: `GPS_NOT_CONFIGURED` (500 — device key env var unset), `INVALID_DEVICE_KEY` (401), plus existing `VALIDATION_ERROR` (400). Fail-closed device auth is a dedicated middleware, not `requireAuth`.
- Response conventions (spec §6): collection endpoints → `{ data, count }`. `/gps/latest`, `/gps/history`, `/analytics/predictive-maintenance`, `/analytics/association-rules` all return `{ data, count }`. `/analytics/dashboard` returns a bare metrics object.
- **Read access (spec §5 matrix): gps AND analytics reads are `requireRole('admin', 'evp_operations')` — no other role.** `POST /gps/ingest` uses device-key auth (NOT a user JWT), so it is NOT behind `requireAuth`.
- **GPS ingest is FAIL-CLOSED (spec §10 — a deliberate change from the current edge function, which fails OPEN):** the `x-device-api-key` header is checked against `GPS_DEVICE_API_KEY`. If the env var is **unset → 500 `GPS_NOT_CONFIGURED`**; if the header is missing or mismatched → **401 `INVALID_DEVICE_KEY`**. Header-only (drop the current edge function's `api_key`-in-body support — the ESP32 firmware already uses the header). Ingest inserts a `gps_data` row and updates the vehicle's `latitude`/`longitude`/`lastLocationUpdate` in one transaction.
- **`/gps/latest` uses raw SQL `SELECT DISTINCT ON (vehicle_id) … ORDER BY vehicle_id, created_at DESC`** joined with vehicle info (the `@@index([vehicleId, createdAt desc])` from Plan 1 supports it) — NOT the fetch-all-and-reduce-in-JS pattern the FE uses today.
- **ML fidelity (spec §11 / §13 — golden-value tests mandated):** the ported inference must reproduce the current client-side behavior EXACTLY.
  - **Feature extraction** takes an **injected `now: Date`** (the formulas use the wall clock, which is non-deterministic — the service passes `new Date()`, tests freeze it). Three features: `KM_SINCE_LAST_MAINT`, `AVG_DAILY_KM`, `MAINT_FREQ_12M` — ported verbatim (Task 2).
  - **Random Forest** traversal: at an internal node go **left if `value <= threshold`, else right**; a leaf returns `probs[1]` (P(fail)); the forest score is the **arithmetic mean of `probs[1]` across all 200 trees** (soft voting). **Feed RAW feature values** — the model's thresholds are large negatives (it was trained on scaled features); **do NOT "re-fix" the thresholds**, port the raw-feature traversal as-is (the golden values below were computed on exactly this traversal).
  - **Rule-based fallback** (used only when the model file is missing/invalid): weights `{km:0.45, daily:0.30, freq:0.25}`, `DEFAULT_MAINT_INTERVAL_KM=5000`, `normKm=min(km/5000,2)/2`, `normDaily=min(daily/100,1)`, `normFreq=max(0,1-freq/6)`.
  - **Risk thresholds: adopt the Flask canonical `0.70`/`0.45`** (spec §11 resolves the FE-vs-Flask mismatch): applied to the raw score (0–1) — `>=0.70` high, `>=0.45` medium, else low. `riskScore` field = `round(clamp(rawScore,0,1)*100)` (integer 0–100).
- **Apriori (spec §11):** pairs-only (max itemset size 2). `minSupport=0.1`, `minConfidence=0.3`, **no min-lift filter**. Transactions rebuilt from `job_order_spare_parts` grouped by `jobOrderId` → array of `sparePartId`, de-duped per transaction, mapped to spare-part names. Both rule directions computed, then sorted (confidence desc, support desc) and de-duped by unordered pair (stronger direction survives). Returns the full de-duplicated ruleset; optional `?vehicleType=` filters transactions by the vehicle's make.
- **The RF model JSON** (`rf_maintenance_model.json`, ~890 KB) is COPIED (not moved — the FE still references `public/ml/` until Plan 7) into `apps/api/src/assets/`, loaded ONCE at module init via `readFileSync(new URL('../../assets/rf_maintenance_model.json', import.meta.url))`, and the `apps/api` build copies `src/assets` → `dist/assets` so `node dist/…` finds it.
- **No new migration in this plan** (gps_data, vehicles.latitude/longitude/last_location_update all exist from Plan 1). The test-DB `TABLES` list already includes `gps_data` — no change.
- Conventional commits; NO `Co-Authored-By` lines. All work on `production`. Docker Desktop is flaky on this host — relaunch + poll `docker info` before DB work if needed.

---

### Task 1: Shared contracts + `GPS_DEVICE_API_KEY` config

**Files:**
- Create: `packages/shared/src/contracts/gps.ts`, `packages/shared/src/contracts/analytics.ts`
- Modify: `packages/shared/src/index.ts`, `apps/api/src/config.ts`
- Test: `apps/api/src/lib/gps-contracts.test.ts`

**Interfaces:**
- Produces: `@mms/shared` — `ingestGpsBodySchema`/`IngestGpsBody`, `gpsHistoryQuerySchema`/`GpsHistoryQuery`; `dashboardMetricsSchema`/`DashboardMetrics`, `riskAssessmentSchema`/`RiskAssessment`, `associationRuleSchema`/`AssociationRule`, `associationRulesQuerySchema`/`AssociationRulesQuery`. `apps/api` `envSchema` gains `GPS_DEVICE_API_KEY` (optional, boot-time validation ONLY — NOT added to the exported `config` object; the device-key middleware reads `process.env.GPS_DEVICE_API_KEY` live).

- [ ] **Step 1: Write the failing test**

`apps/api/src/lib/gps-contracts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { gpsHistoryQuerySchema, ingestGpsBodySchema } from '@mms/shared';

describe('gps contracts', () => {
  it('accepts a valid ingest payload and coerces numbers', () => {
    const parsed = ingestGpsBodySchema.parse({
      vehicleId: '00000000-0000-4000-8000-000000000001',
      latitude: '7.0731',
      longitude: '125.6128',
      speed: '45.2',
      heading: '90',
      engineStatus: 'on'
    });
    expect(parsed.latitude).toBeCloseTo(7.0731);
    expect(parsed.speed).toBeCloseTo(45.2);
  });

  it('rejects out-of-range coordinates', () => {
    expect(() => ingestGpsBodySchema.parse({ vehicleId: '00000000-0000-4000-8000-000000000001', latitude: 91, longitude: 0 })).toThrow();
    expect(() => ingestGpsBodySchema.parse({ vehicleId: '00000000-0000-4000-8000-000000000001', latitude: 0, longitude: 181 })).toThrow();
  });

  it('history query: vehicleId required, limit defaults 500 / caps at 5000', () => {
    expect(() => gpsHistoryQuerySchema.parse({})).toThrow(); // vehicleId required
    const d = gpsHistoryQuerySchema.parse({ vehicleId: '00000000-0000-4000-8000-000000000001' });
    expect(d.limit).toBe(500);
    expect(() => gpsHistoryQuerySchema.parse({ vehicleId: '00000000-0000-4000-8000-000000000001', limit: '6000' })).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify failure** — `pnpm --filter @mms/api test -- src/lib/gps-contracts` → exports missing.

- [ ] **Step 3: Implement**

`packages/shared/src/contracts/gps.ts`:

```ts
import { z } from 'zod';

// Device ingest payload (header-only device auth handled in middleware).
export const ingestGpsBodySchema = z.object({
  vehicleId: z.string().uuid(),
  tripId: z.string().uuid().nullable().optional(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  speed: z.coerce.number().nullable().optional(),
  heading: z.coerce.number().nullable().optional(),
  engineStatus: z.string().nullable().optional() // free text; only 'on' seen today
});
export type IngestGpsBody = z.infer<typeof ingestGpsBodySchema>;

export const gpsHistoryQuerySchema = z.object({
  vehicleId: z.string().uuid(),
  tripId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(500)
});
export type GpsHistoryQuery = z.infer<typeof gpsHistoryQuerySchema>;
```

`packages/shared/src/contracts/analytics.ts`:

```ts
import { z } from 'zod';

export const dashboardMetricsSchema = z.object({
  available: z.number(),
  underMaintenance: z.number(),
  onTrip: z.number(),
  outOfService: z.number(),
  total: z.number(),
  completedTrips: z.number()
});
export type DashboardMetrics = z.infer<typeof dashboardMetricsSchema>;

export const riskAssessmentSchema = z.object({
  vehicleId: z.string().uuid(),
  make: z.string(),
  model: z.string(),
  licensePlate: z.string(),
  mileage: z.number(),
  kmSinceLastMaint: z.number(),
  avgDailyKm: z.number(),
  maintFreq12m: z.number(),
  riskScore: z.number(), // 0-100
  priority: z.enum(['high', 'medium', 'low']),
  usedFallback: z.boolean()
});
export type RiskAssessment = z.infer<typeof riskAssessmentSchema>;

export const associationRuleSchema = z.object({
  partA: z.string(),
  partAId: z.string(),
  partB: z.string(),
  partBId: z.string(),
  support: z.number(), // integer percent
  confidence: z.number(), // integer percent
  lift: z.number(), // 2dp
  frequency: z.number(), // == confidence
  coOccurrences: z.number()
});
export type AssociationRule = z.infer<typeof associationRuleSchema>;

export const associationRulesQuerySchema = z.object({
  vehicleType: z.string().optional()
});
export type AssociationRulesQuery = z.infer<typeof associationRulesQuerySchema>;
```

Append to `packages/shared/src/index.ts`:

```ts
export * from './contracts/gps.js';
export * from './contracts/analytics.js';
```

In `apps/api/src/config.ts`, add ONLY `GPS_DEVICE_API_KEY: z.string().optional()` to `envSchema` (so the var is known/validated at boot and documented). **Do NOT add it to the exported `config` object** — the device-key middleware (Task 4) reads `process.env.GPS_DEVICE_API_KEY` **live at request time**, not the once-parsed `config` singleton, so that per-test env toggling works (the fail-closed-when-unset test needs it unset; the happy-path needs it set). A cached `config.gpsDeviceApiKey` could not reflect those per-test changes and would be dead code.

```ts
  // ... add to envSchema only:
  GPS_DEVICE_API_KEY: z.string().optional()
```

Also add `GPS_DEVICE_API_KEY=` to `apps/api/.env.example` (documented; unset by default). Task 4's tests set/clear `process.env.GPS_DEVICE_API_KEY` per case.

- [ ] **Step 4: Run tests to verify they pass** — `pnpm --filter @mms/shared build && pnpm --filter @mms/api test -- src/lib/gps-contracts` green; `pnpm typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api packages/shared
git commit -m "feat: add gps/analytics contracts and GPS_DEVICE_API_KEY config"
```

---

### Task 2: Predictive-maintenance ML core (features + Random Forest + fallback + risk) + model asset

**Files:**
- Create: `apps/api/src/assets/rf_maintenance_model.json` (COPIED from `apps/web/public/ml/`), `apps/api/src/lib/ml/features.ts`, `apps/api/src/lib/ml/random-forest.ts`, `apps/api/src/lib/ml/risk.ts`, `apps/api/scripts/copy-assets.mjs`
- Modify: `apps/api/package.json` (build script copies assets)
- Test: `apps/api/src/lib/ml/predictive.test.ts`

**Interfaces:**
- Produces (consumed by Task 5):
  - `features.js`: `extractFeatures(vehicle: { mileage: number }, maintenances: { date: Date; mileage: number | null }[], now: Date): { kmSinceLastMaint: number; avgDailyKm: number; maintFreq12m: number }` — maintenances need NOT be pre-sorted (the function sorts a copy descending by date).
  - `random-forest.js`: `loadModel(): RFModel | null` (cached; returns null if the asset is missing/invalid), `predictRandomForest(model: RFModel, features: Record<string, number>): number` (mean of `probs[1]`).
  - `risk.js`: `RISK_THRESHOLDS = { high: 0.70, medium: 0.45 }`; `fallbackScore(f): number`; `computeVehicleRisk(model: RFModel | null, f): { rawScore: number; riskScore: number; priority: 'high'|'medium'|'low'; usedFallback: boolean }`.

- [ ] **Step 1: Copy the model asset + wire the build copy**

```bash
mkdir -p apps/api/src/assets
cp apps/web/public/ml/rf_maintenance_model.json apps/api/src/assets/rf_maintenance_model.json
```

`apps/api/scripts/copy-assets.mjs`:

```js
import { cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// tsc does not copy non-TS assets; mirror src/assets into dist/assets so the
// built server (node dist/…) can read the RF model at runtime.
const src = fileURLToPath(new URL('../src/assets', import.meta.url));
const dest = fileURLToPath(new URL('../dist/assets', import.meta.url));
if (existsSync(src)) {
  cpSync(src, dest, { recursive: true });
  console.log(`copied assets → ${dest}`);
}
```

In `apps/api/package.json`, change the build script to run the copy after `tsc` (preserve the existing tsc invocation — likely `tsc -p tsconfig.build.json`):

```json
"build": "tsc -p tsconfig.build.json && node scripts/copy-assets.mjs"
```

(If the current `build` differs, append ` && node scripts/copy-assets.mjs` to it.)

- [ ] **Step 2: Write the failing golden-value test**

`apps/api/src/lib/ml/predictive.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extractFeatures } from './features.js';
import { loadModel, predictRandomForest } from './random-forest.js';
import { computeVehicleRisk, fallbackScore } from './risk.js';

const model = loadModel();

describe('random forest (golden values from the committed model)', () => {
  it('loads the 200-tree model', () => {
    expect(model).not.toBeNull();
    expect(model?.trees.length).toBe(200);
  });

  // Golden rawScores computed by replicating the traversal over the committed model.
  const cases: [Record<string, number>, number][] = [
    [{ KM_SINCE_LAST_MAINT: 0, AVG_DAILY_KM: 0, MAINT_FREQ_12M: 0 }, 0.18],
    [{ KM_SINCE_LAST_MAINT: 15000, AVG_DAILY_KM: 80, MAINT_FREQ_12M: 2 }, 0.30],
    [{ KM_SINCE_LAST_MAINT: 5000, AVG_DAILY_KM: 50, MAINT_FREQ_12M: 1 }, 0.33],
    [{ KM_SINCE_LAST_MAINT: 2000, AVG_DAILY_KM: 30, MAINT_FREQ_12M: 3 }, 0.38],
    [{ KM_SINCE_LAST_MAINT: 100000, AVG_DAILY_KM: 200, MAINT_FREQ_12M: 0 }, 0.915]
  ];
  it.each(cases)('scores %o → %f', (features, expected) => {
    expect(predictRandomForest(model!, features)).toBeCloseTo(expected, 5);
  });

  it('computeVehicleRisk applies canonical 0.70/0.45 thresholds and rounds riskScore', () => {
    const high = computeVehicleRisk(model, { kmSinceLastMaint: 100000, avgDailyKm: 200, maintFreq12m: 0 });
    expect(high.riskScore).toBe(92); // round(0.915*100)
    expect(high.priority).toBe('high');
    expect(high.usedFallback).toBe(false);
    const low = computeVehicleRisk(model, { kmSinceLastMaint: 0, avgDailyKm: 0, maintFreq12m: 0 });
    expect(low.riskScore).toBe(18);
    expect(low.priority).toBe('low');
  });
});

describe('fallback scoring (golden values)', () => {
  const cases: [{ kmSinceLastMaint: number; avgDailyKm: number; maintFreq12m: number }, number][] = [
    [{ kmSinceLastMaint: 0, avgDailyKm: 0, maintFreq12m: 0 }, 0.25],
    [{ kmSinceLastMaint: 5000, avgDailyKm: 50, maintFreq12m: 1 }, 0.58333],
    [{ kmSinceLastMaint: 15000, avgDailyKm: 80, maintFreq12m: 2 }, 0.85667],
    [{ kmSinceLastMaint: 100000, avgDailyKm: 200, maintFreq12m: 0 }, 1.0]
  ];
  it.each(cases)('fallbackScore %o ≈ %f', (f, expected) => {
    expect(fallbackScore(f)).toBeCloseTo(expected, 4);
  });

  it('computeVehicleRisk(null model, …) uses the fallback and reports usedFallback', () => {
    const r = computeVehicleRisk(null, { kmSinceLastMaint: 5000, avgDailyKm: 50, maintFreq12m: 1 });
    expect(r.usedFallback).toBe(true);
    expect(r.riskScore).toBe(58); // round(0.58333*100)
    expect(r.priority).toBe('medium'); // 0.583 >= 0.45
  });
});

describe('feature extraction (frozen clock for determinism)', () => {
  const now = new Date('2026-07-01T00:00:00.000Z');

  it('no maintenance → kmSinceLastMaint = mileage, avgDailyKm 0, freq 0', () => {
    expect(extractFeatures({ mileage: 12000 }, [], now)).toEqual({ kmSinceLastMaint: 12000, avgDailyKm: 0, maintFreq12m: 0 });
  });

  it('two maintenances → km between newest/oldest over days between; freq counts last 12m', () => {
    const maints = [
      { date: new Date('2026-06-01T00:00:00.000Z'), mileage: 11000 }, // newest
      { date: new Date('2026-05-02T00:00:00.000Z'), mileage: 10000 } // oldest (30 days earlier)
    ];
    const f = extractFeatures({ mileage: 12000 }, maints, now);
    expect(f.kmSinceLastMaint).toBe(1000); // 12000 - 11000 (newest)
    expect(f.avgDailyKm).toBeCloseTo(1000 / 30, 4); // |11000-10000| / 30 days
    expect(f.maintFreq12m).toBe(2);
  });

  it('single maintenance → avgDailyKm = kmSinceLast / days since that maintenance', () => {
    const maints = [{ date: new Date('2026-06-01T00:00:00.000Z'), mileage: 11000 }]; // 30 days before now
    const f = extractFeatures({ mileage: 12000 }, maints, now);
    expect(f.avgDailyKm).toBeCloseTo(1000 / 30, 4);
  });
});
```

- [ ] **Step 3: Run to verify failure** — `pnpm --filter @mms/api test -- src/lib/ml/predictive` → modules missing.

- [ ] **Step 4: Implement**

`apps/api/src/lib/ml/features.ts`:

```ts
// Ported verbatim from the FE (predictive-maintenance.ts extractFeatures /
// analytics.ts extractVehicleFeatures — byte-identical). `now` is injected so
// the computation is deterministic and testable (the FE used new Date()).
const DAY_MS = 1000 * 60 * 60 * 24;

interface MaintenanceRow {
  date: Date;
  mileage: number | null;
}

export function extractFeatures(
  vehicle: { mileage: number },
  maintenances: MaintenanceRow[],
  now: Date
): { kmSinceLastMaint: number; avgDailyKm: number; maintFreq12m: number } {
  // Newest first.
  const rows = [...maintenances].sort((a, b) => b.date.getTime() - a.date.getTime());
  const lastMaint = rows[0];
  const lastMaintMileage = lastMaint?.mileage ?? 0;
  const kmSinceLastMaint = Math.max(0, vehicle.mileage - lastMaintMileage);

  let avgDailyKm = 0;
  if (rows.length >= 2) {
    const newest = rows[0]!;
    const oldest = rows[rows.length - 1]!;
    const daysBetween = Math.max(1, (newest.date.getTime() - oldest.date.getTime()) / DAY_MS);
    const kmBetween = Math.abs((newest.mileage ?? 0) - (oldest.mileage ?? 0));
    avgDailyKm = kmBetween / daysBetween;
  } else if (lastMaint) {
    const daysSinceLast = Math.max(1, (now.getTime() - lastMaint.date.getTime()) / DAY_MS);
    avgDailyKm = kmSinceLastMaint / daysSinceLast;
  }

  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const maintFreq12m = rows.filter((m) => m.date >= oneYearAgo).length;

  return { kmSinceLastMaint, avgDailyKm, maintFreq12m };
}
```

`apps/api/src/lib/ml/random-forest.ts`:

```ts
import { readFileSync } from 'node:fs';

interface TreeLeaf {
  probs: number[];
}
interface TreeNode {
  feature: string;
  threshold: number;
  left: TreeNode | TreeLeaf;
  right: TreeNode | TreeLeaf;
}
export interface RFModel {
  features: string[];
  n_estimators: number;
  classes: number[];
  trees: (TreeNode | TreeLeaf)[];
}

let cachedModel: RFModel | null | undefined;

// Loads the committed model once (or returns null if missing/invalid → the
// caller uses the rule-based fallback). Resolved relative to this module so it
// works under both tsx (src/) and node (dist/, via the build asset copy).
export function loadModel(): RFModel | null {
  if (cachedModel !== undefined) return cachedModel;
  try {
    const url = new URL('../../assets/rf_maintenance_model.json', import.meta.url);
    const parsed = JSON.parse(readFileSync(url, 'utf-8')) as RFModel;
    cachedModel = Array.isArray(parsed.trees) && parsed.trees.length > 0 ? parsed : null;
  } catch {
    cachedModel = null;
  }
  return cachedModel;
}

function predictTree(node: TreeNode | TreeLeaf, features: Record<string, number>): number {
  if ('probs' in node) return node.probs[1] ?? 0;
  const value = features[node.feature] ?? 0;
  return value <= node.threshold ? predictTree(node.left, features) : predictTree(node.right, features);
}

// Soft voting: mean of P(fail) across all trees. RAW feature values (do NOT
// scale — the model thresholds are baked to expect raw inputs; §11).
export function predictRandomForest(model: RFModel, features: Record<string, number>): number {
  const probs = model.trees.map((t) => predictTree(t, features));
  return probs.reduce((sum, p) => sum + p, 0) / probs.length;
}
```

`apps/api/src/lib/ml/risk.ts`:

```ts
import type { RFModel } from './random-forest.js';
import { predictRandomForest } from './random-forest.js';

// Canonical thresholds (spec §11 adopts the Flask values over the FE's 0.65/0.40).
export const RISK_THRESHOLDS = { high: 0.7, medium: 0.45 } as const;

const FALLBACK_WEIGHTS = { kmSinceLastMaint: 0.45, avgDailyKm: 0.3, maintFreq12m: 0.25 };
const DEFAULT_MAINT_INTERVAL_KM = 5000;

interface Features {
  kmSinceLastMaint: number;
  avgDailyKm: number;
  maintFreq12m: number;
}

// Rule-based fallback (model absent/invalid). Ported verbatim.
export function fallbackScore(f: Features): number {
  const normKm = Math.min(f.kmSinceLastMaint / DEFAULT_MAINT_INTERVAL_KM, 2.0) / 2.0;
  const normDaily = Math.min(f.avgDailyKm / 100, 1.0);
  const normFreq = Math.max(0, 1 - f.maintFreq12m / 6);
  return FALLBACK_WEIGHTS.kmSinceLastMaint * normKm + FALLBACK_WEIGHTS.avgDailyKm * normDaily + FALLBACK_WEIGHTS.maintFreq12m * normFreq;
}

function priorityFor(rawScore: number): 'high' | 'medium' | 'low' {
  if (rawScore >= RISK_THRESHOLDS.high) return 'high';
  if (rawScore >= RISK_THRESHOLDS.medium) return 'medium';
  return 'low';
}

export function computeVehicleRisk(
  model: RFModel | null,
  f: Features
): { rawScore: number; riskScore: number; priority: 'high' | 'medium' | 'low'; usedFallback: boolean } {
  const rawScore = model
    ? predictRandomForest(model, {
        KM_SINCE_LAST_MAINT: f.kmSinceLastMaint,
        AVG_DAILY_KM: f.avgDailyKm,
        MAINT_FREQ_12M: f.maintFreq12m
      })
    : fallbackScore(f);
  const clamped = Math.min(Math.max(rawScore, 0), 1);
  return {
    rawScore,
    riskScore: Math.round(clamped * 100),
    priority: priorityFor(rawScore),
    usedFallback: model === null
  };
}
```

- [ ] **Step 5: Run tests to verify they pass** — `pnpm --filter @mms/api test -- src/lib/ml/predictive` all green; `pnpm build` (verify the asset copies to `dist/assets/`); `pnpm typecheck` clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat: port predictive-maintenance ML core (features, random forest, fallback) with the model asset"
```

---

### Task 3: Apriori association-rule mining core

**Files:**
- Create: `apps/api/src/lib/ml/apriori.ts`
- Test: `apps/api/src/lib/ml/apriori.test.ts`

**Interfaces:**
- Produces (consumed by Task 5): `computeAssociationRules(transactions: { parts: string[] }[], partLookup: Map<string, string>, minSupport?: number, minConfidence?: number): AssociationRule[]` (defaults `0.1`/`0.3`).

- [ ] **Step 1: Write the failing golden test**

`apps/api/src/lib/ml/apriori.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeAssociationRules } from './apriori.js';

const lookup = new Map([['A', 'A'], ['B', 'B'], ['C', 'C']]);

describe('apriori association rules (golden example)', () => {
  it('derives the expected deduped ruleset from T1..T4', () => {
    const txns = [{ parts: ['A', 'B'] }, { parts: ['A', 'B'] }, { parts: ['A', 'C'] }, { parts: ['B', 'C'] }];
    const rules = computeAssociationRules(txns, lookup, 0.1, 0.3);
    // Deduped to one rule per unordered pair; A→B strongest.
    expect(rules).toHaveLength(3);
    const ab = rules.find((r) => r.partAId === 'A' && r.partBId === 'B')!;
    expect(ab).toMatchObject({ support: 50, confidence: 67, frequency: 67, coOccurrences: 2 });
    expect(ab.lift).toBeCloseTo(0.89, 2);
    // C→A kept over A→C (0.5 > 0.333); C→B kept over B→C.
    expect(rules.some((r) => r.partAId === 'C' && r.partBId === 'A' && r.confidence === 50)).toBe(true);
    expect(rules.some((r) => r.partAId === 'C' && r.partBId === 'B' && r.confidence === 50)).toBe(true);
  });

  it('returns [] with fewer than 2 valid (>=2-part) transactions', () => {
    expect(computeAssociationRules([{ parts: ['A', 'B'] }], lookup)).toEqual([]);
    expect(computeAssociationRules([{ parts: ['A'] }, { parts: ['B'] }], lookup)).toEqual([]);
  });

  it('de-dupes parts within a transaction before counting', () => {
    const txns = [{ parts: ['A', 'A', 'B'] }, { parts: ['A', 'B'] }];
    const rules = computeAssociationRules(txns, lookup, 0.1, 0.3);
    const ab = rules.find((r) => (r.partAId === 'A' && r.partBId === 'B') || (r.partAId === 'B' && r.partBId === 'A'))!;
    expect(ab.coOccurrences).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify failure** — module missing.

- [ ] **Step 3: Implement**

`apps/api/src/lib/ml/apriori.ts` (ported verbatim from `spare-parts-association.ts`):

```ts
import type { AssociationRule } from '@mms/shared';

function makePairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// Pairs-only "Apriori": 1-itemset + 2-itemset counts, support/confidence in both
// directions, then sort (confidence desc, support desc) + dedupe per unordered
// pair (stronger direction survives). No min-lift filter (§11).
export function computeAssociationRules(
  transactions: { parts: string[] }[],
  partLookup: Map<string, string>,
  minSupport = 0.1,
  minConfidence = 0.3
): AssociationRule[] {
  const valid = transactions.filter((t) => t.parts.length >= 2);
  const total = valid.length;
  if (total < 2) return [];

  const itemCounts = new Map<string, number>();
  const pairCounts = new Map<string, number>();
  for (const txn of valid) {
    const unique = [...new Set(txn.parts)];
    for (const part of unique) itemCounts.set(part, (itemCounts.get(part) ?? 0) + 1);
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const key = makePairKey(unique[i]!, unique[j]!);
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const rules: AssociationRule[] = [];
  for (const [pairKey, coCount] of pairCounts) {
    const [aId, bId] = pairKey.split('|') as [string, string];
    const support = coCount / total;
    if (support < minSupport) continue;
    const countA = itemCounts.get(aId) ?? 0;
    const countB = itemCounts.get(bId) ?? 0;
    if (countA === 0 || countB === 0) continue;

    const push = (fromId: string, toId: string, conf: number, lift: number) => {
      rules.push({
        partAId: fromId,
        partBId: toId,
        partA: partLookup.get(fromId) ?? fromId,
        partB: partLookup.get(toId) ?? toId,
        support: Math.round(support * 100),
        confidence: Math.round(conf * 100),
        lift: Math.round(lift * 100) / 100,
        frequency: Math.round(conf * 100),
        coOccurrences: coCount
      });
    };

    const confAB = coCount / countA;
    const liftAB = countB / total > 0 ? confAB / (countB / total) : 0;
    if (confAB >= minConfidence) push(aId, bId, confAB, liftAB);

    const confBA = coCount / countB;
    const liftBA = countA / total > 0 ? confBA / (countA / total) : 0;
    if (confBA >= minConfidence) push(bId, aId, confBA, liftBA);
  }

  rules.sort((a, b) => b.confidence - a.confidence || b.support - a.support);
  const seen = new Set<string>();
  return rules.filter((r) => {
    const key = makePairKey(r.partAId, r.partBId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass** — green; `pnpm typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: port Apriori spare-parts association-rule mining"
```

---

### Task 4: GPS module (ingest fail-closed, latest via DISTINCT ON, history)

**Files:**
- Create: `apps/api/src/middleware/require-device-key.ts`, `apps/api/src/modules/gps/repository.ts`, `apps/api/src/modules/gps/service.ts`, `apps/api/src/modules/gps/controller.ts`, `apps/api/src/modules/gps/router.ts`
- Modify: `apps/api/src/app.ts` (mount)
- Test: `apps/api/src/modules/gps/gps.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts, `process.env.GPS_DEVICE_API_KEY` (read live in the middleware — NOT the config object), `requireAuth`, `requireRole`, `validateBody`, `AppError`, factories.
- Produces: `POST /api/gps/ingest` (device key, fail-closed; inserts gps_data + updates vehicle location), `GET /api/gps/latest` (admin/evp; `{ data, count }`, newest per vehicle via `DISTINCT ON`, joined with vehicle), `GET /api/gps/history?vehicleId=&tripId=&from=&to=&limit=` (admin/evp; `{ data, count }`, created_at desc).

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/gps/gps.test.ts`:

```ts
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestBranch, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

async function makeVehicle() {
  const branch = await createTestBranch();
  return prisma.vehicle.create({
    data: {
      make: 'T', model: 'H', year: 2021, vin: 'V1', licensePlate: 'P1', capacity: 5,
      fuelType: 'diesel', mileage: 1000, status: 'available', branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'), registrationExpiry: new Date('2027-01-01')
    }
  });
}

describe('gps module', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());
  afterEach(() => { delete process.env.GPS_DEVICE_API_KEY; });

  it('ingest FAILS CLOSED with 500 when GPS_DEVICE_API_KEY is unset', async () => {
    delete process.env.GPS_DEVICE_API_KEY;
    const app = createApp();
    const v = await makeVehicle();
    const res = await request(app).post('/api/gps/ingest').set('x-device-api-key', 'anything')
      .send({ vehicleId: v.id, latitude: 7.07, longitude: 125.6 });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('GPS_NOT_CONFIGURED');
  });

  it('ingest 401 on a missing/mismatched device key; 200 + writes on match', async () => {
    process.env.GPS_DEVICE_API_KEY = 'secret-key';
    const app = createApp();
    const v = await makeVehicle();

    const noKey = await request(app).post('/api/gps/ingest').send({ vehicleId: v.id, latitude: 7.07, longitude: 125.6 });
    expect(noKey.status).toBe(401);
    const wrong = await request(app).post('/api/gps/ingest').set('x-device-api-key', 'nope').send({ vehicleId: v.id, latitude: 7.07, longitude: 125.6 });
    expect(wrong.status).toBe(401);

    const ok = await request(app).post('/api/gps/ingest').set('x-device-api-key', 'secret-key')
      .send({ vehicleId: v.id, latitude: 7.07, longitude: 125.6, speed: 45, heading: 90, engineStatus: 'on' });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ success: true });
    expect(await prisma.gpsData.count({ where: { vehicleId: v.id } })).toBe(1);
    const updated = await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } });
    expect(updated.latitude).toBeCloseTo(7.07);
    expect(updated.lastLocationUpdate).not.toBeNull();
  });

  it('ingest 400 on out-of-range coordinates (after auth)', async () => {
    process.env.GPS_DEVICE_API_KEY = 'secret-key';
    const app = createApp();
    const v = await makeVehicle();
    const res = await request(app).post('/api/gps/ingest').set('x-device-api-key', 'secret-key')
      .send({ vehicleId: v.id, latitude: 999, longitude: 0 });
    expect(res.status).toBe(400);
  });

  it('GET /gps/latest returns the newest point per vehicle (admin), embeds vehicle', async () => {
    const app = createApp();
    const v = await makeVehicle();
    await prisma.gpsData.create({ data: { vehicleId: v.id, latitude: 1, longitude: 1, createdAt: new Date('2026-07-01T00:00:00Z') } });
    await prisma.gpsData.create({ data: { vehicleId: v.id, latitude: 2, longitude: 2, createdAt: new Date('2026-07-02T00:00:00Z') } });
    const { user } = await createTestUser({ email: 'a@test.local', role: 'admin' });
    const res = await request(app).get('/api/gps/latest').set('Authorization', authHeader(user.id, user.email, 'admin'));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0].latitude).toBeCloseTo(2); // newest
    expect(res.body.data[0].make).toBe('T'); // joined vehicle info
    // Shape is camelCase like every other endpoint (aliased in the raw SQL).
    expect(res.body.data[0]).toHaveProperty('id');
    expect(res.body.data[0]).toHaveProperty('vehicleId', v.id);
    expect(res.body.data[0]).toHaveProperty('createdAt');
  });

  it('GET /gps/latest 403 for non-admin/non-evp roles', async () => {
    const app = createApp();
    const { user } = await createTestUser({ email: 'd@test.local', role: 'driver' });
    const res = await request(app).get('/api/gps/latest').set('Authorization', authHeader(user.id, user.email, 'driver'));
    expect(res.status).toBe(403);
  });

  it('GET /gps/history filters by vehicleId + limit, newest first', async () => {
    const app = createApp();
    const v = await makeVehicle();
    for (let i = 0; i < 3; i++) {
      await prisma.gpsData.create({ data: { vehicleId: v.id, latitude: i, longitude: i, createdAt: new Date(`2026-07-0${i + 1}T00:00:00Z`) } });
    }
    const { user } = await createTestUser({ email: 'e@test.local', role: 'evp_operations' });
    const res = await request(app).get(`/api/gps/history?vehicleId=${v.id}&limit=2`).set('Authorization', authHeader(user.id, user.email, 'evp_operations'));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3); // total matching rows (spec §6), NOT the page size
    expect(res.body.data).toHaveLength(2); // the limit-capped page
    expect(new Date(res.body.data[0].createdAt) > new Date(res.body.data[1].createdAt)).toBe(true);
  });
});
```

> **Implementer note:** the device-key middleware reads `process.env.GPS_DEVICE_API_KEY` **directly at request time**, NOT the once-parsed `config` singleton (which cannot reflect per-test env changes). That is why the tests can toggle `process.env.GPS_DEVICE_API_KEY` per case. `createApp()` is called INSIDE each test rather than once at module top for the same reason — so nothing captures a stale app/env. See the middleware below (it reads `process.env` live).

- [ ] **Step 2: Run to verify failure** — 404s / config errors.

- [ ] **Step 3: Implement**

`apps/api/src/middleware/require-device-key.ts`:

```ts
import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';

// Constant-time compare (length-guarded — timingSafeEqual throws on unequal
// lengths) so the device key can't be recovered via response timing.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Fail-CLOSED device auth (spec §10): reads GPS_DEVICE_API_KEY live from the env
// (not the cached config) so it reflects deployment/test setup at request time.
// Unset → 500 GPS_NOT_CONFIGURED; missing/mismatched header → 401.
export function requireDeviceKey(req: Request, _res: Response, next: NextFunction): void {
  const expected = process.env.GPS_DEVICE_API_KEY;
  if (!expected) {
    next(new AppError(500, 'GPS_NOT_CONFIGURED', 'GPS device key is not configured'));
    return;
  }
  const provided = req.header('x-device-api-key');
  if (!provided || !safeEqual(provided, expected)) {
    next(new AppError(401, 'INVALID_DEVICE_KEY', 'Invalid device API key'));
    return;
  }
  next();
}
```

`apps/api/src/modules/gps/repository.ts`:

```ts
import type { Prisma } from '@prisma/client';
import type { IngestGpsBody } from '@mms/shared';
import { prisma } from '../../lib/prisma.js';

// Insert the point and update the vehicle's denormalized latest position, atomically.
export async function ingest(body: IngestGpsBody) {
  return prisma.$transaction(async (tx) => {
    const point = await tx.gpsData.create({
      data: {
        vehicleId: body.vehicleId,
        tripId: body.tripId ?? null,
        latitude: body.latitude,
        longitude: body.longitude,
        speed: body.speed ?? null,
        heading: body.heading ?? null,
        engineStatus: body.engineStatus ?? null
      }
    });
    await tx.vehicle.update({
      where: { id: body.vehicleId },
      data: { latitude: body.latitude, longitude: body.longitude, lastLocationUpdate: new Date() }
    });
    return point;
  });
}

// Newest point per vehicle (spec §10) — DISTINCT ON is not expressible in the
// Prisma query builder, so raw SQL (the @@index([vehicleId, createdAt desc])
// backs it). snake_case columns; joined vehicle summary.
export interface LatestGpsRow {
  id: string;
  vehicleId: string;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  heading: number | null;
  engineStatus: string | null;
  createdAt: Date;
  make: string;
  model: string;
  licensePlate: string;
  status: string;
}

export function latestPerVehicle() {
  // Alias snake_case DB columns to camelCase so /gps/latest matches the shape
  // every other endpoint (Prisma) returns — double-quoted identifiers preserve
  // case in Postgres. Unmapped columns (latitude/longitude/speed/heading/make/
  // model/status) need no alias.
  return prisma.$queryRaw<LatestGpsRow[]>`
    SELECT DISTINCT ON (g.vehicle_id)
      g.gps_id AS "id", g.vehicle_id AS "vehicleId", g.latitude, g.longitude,
      g.speed, g.heading, g.engine_status AS "engineStatus", g.created_at AS "createdAt",
      v.make, v.model, v.license_plate AS "licensePlate", v.status
    FROM gps_data g
    JOIN vehicles v ON v.id = g.vehicle_id
    WHERE g.vehicle_id IS NOT NULL
    ORDER BY g.vehicle_id, g.created_at DESC
  `;
}

export async function history(where: Prisma.GpsDataWhereInput, take: number) {
  const [data, count] = await Promise.all([
    prisma.gpsData.findMany({ where, orderBy: { createdAt: 'desc' }, take }),
    prisma.gpsData.count({ where })
  ]);
  return { data, count };
}
```

`apps/api/src/modules/gps/service.ts`:

```ts
import type { Prisma } from '@prisma/client';
import type { GpsHistoryQuery, IngestGpsBody } from '@mms/shared';
import * as repo from './repository.js';

export async function ingest(body: IngestGpsBody) {
  const point = await repo.ingest(body);
  return { success: true, gpsId: point.id };
}

export async function latest() {
  const rows = await repo.latestPerVehicle();
  return { data: rows, count: rows.length };
}

export async function history(query: GpsHistoryQuery) {
  const where: Prisma.GpsDataWhereInput = {
    vehicleId: query.vehicleId,
    ...(query.tripId ? { tripId: query.tripId } : {}),
    ...(query.from || query.to
      ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
      : {})
  };
  return repo.history(where, query.limit);
}
```

`apps/api/src/modules/gps/controller.ts`:

```ts
import type { Request, Response } from 'express';
import type { IngestGpsBody } from '@mms/shared';
import { gpsHistoryQuerySchema } from '@mms/shared';
import * as service from './service.js';

export async function ingest(req: Request, res: Response): Promise<void> {
  res.status(201).json(await service.ingest(req.body as IngestGpsBody));
}

export async function latest(_req: Request, res: Response): Promise<void> {
  res.json(await service.latest());
}

export async function history(req: Request, res: Response): Promise<void> {
  res.json(await service.history(gpsHistoryQuerySchema.parse(req.query)));
}
```

`apps/api/src/modules/gps/router.ts`:

```ts
import { Router } from 'express';
import { USER_ROLES, ingestGpsBodySchema } from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireDeviceKey } from '../../middleware/require-device-key.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

const ANALYTICS_ROLES = [USER_ROLES.admin, USER_ROLES.evp_operations] as const;

export const gpsRouter = Router();

// Device-key auth, NOT requireAuth. Auth runs BEFORE body validation.
gpsRouter.post('/ingest', requireDeviceKey, validateBody(ingestGpsBodySchema), controller.ingest);

// User-JWT reads, admin/evp only.
gpsRouter.get('/latest', requireAuth, requireRole(...ANALYTICS_ROLES), controller.latest);
gpsRouter.get('/history', requireAuth, requireRole(...ANALYTICS_ROLES), controller.history);
```

Mount in `apps/api/src/app.ts`:

```ts
import { gpsRouter } from './modules/gps/router.js';
// ...
  app.use('/api/gps', gpsRouter);
```

- [ ] **Step 4: Run tests to verify they pass** — full suite green; `pnpm typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: add gps module with fail-closed ingest, DISTINCT ON latest, and history"
```

---

### Task 5: Analytics module (dashboard + predictive-maintenance + association-rules)

**Files:**
- Create: `apps/api/src/modules/analytics/repository.ts`, `apps/api/src/modules/analytics/service.ts`, `apps/api/src/modules/analytics/controller.ts`, `apps/api/src/modules/analytics/router.ts`
- Modify: `apps/api/src/app.ts` (mount)
- Test: `apps/api/src/modules/analytics/analytics.test.ts`

**Interfaces:**
- Consumes: Task 2 (`extractFeatures`, `loadModel`, `computeVehicleRisk`), Task 3 (`computeAssociationRules`), contracts, middleware, factories.
- Produces: `GET /api/analytics/dashboard` (admin/evp; bare `DashboardMetrics`), `GET /api/analytics/predictive-maintenance` (admin/evp; `{ data: RiskAssessment[], count }`), `GET /api/analytics/association-rules?vehicleType=` (admin/evp; `{ data: AssociationRule[], count }`).

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/analytics/analytics.test.ts`:

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { authHeader, createTestBranch, createTestUser } from '../../test/factories.js';
import { truncateAll } from '../../test/db.js';

const app = createApp();

async function adminHeader() {
  const { user } = await createTestUser({ email: 'a@test.local', role: 'admin' });
  return authHeader(user.id, user.email, 'admin');
}

async function vehicle(status: string, mileage = 1000) {
  const branch = await createTestBranch();
  return prisma.vehicle.create({
    data: {
      make: 'Toyota', model: 'Hiace', year: 2021, vin: `V${Math.random()}`, licensePlate: `P${Math.random()}`,
      capacity: 5, fuelType: 'diesel', mileage, status: status as never, branchId: branch.id,
      insuranceExpiry: new Date('2027-01-01'), registrationExpiry: new Date('2027-01-01')
    }
  });
}

describe('analytics module', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('GET /analytics/dashboard returns status buckets + completedTrips', async () => {
    const header = await adminHeader();
    await vehicle('available');
    await vehicle('available');
    await vehicle('under_maintenance');
    const v = await vehicle('on_trip');
    const driver = await prisma.driver.create({ data: { email: 'd@t.local', fullName: 'D', status: 'active' } });
    await prisma.tripTicket.create({ data: { branchId: (await createTestBranch()).id, driverId: driver.id, vehicleId: v.id, destination: 'X', purpose: 'Y', dateRequested: new Date('2026-07-01'), preparedBy: '', status: 'completed' } });

    const res = await request(app).get('/api/analytics/dashboard').set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ available: 2, underMaintenance: 1, onTrip: 1, completedTrips: 1 });
    expect(res.body.total).toBe(4);
  });

  it('GET /analytics/predictive-maintenance scores every vehicle', async () => {
    const header = await adminHeader();
    const v = await vehicle('available', 100000);
    await prisma.maintenance.create({ data: { vehicleId: v.id, type: 'service', date: new Date('2020-01-01'), mileage: 0 } });
    const res = await request(app).get('/api/analytics/predictive-maintenance').set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0]).toHaveProperty('riskScore');
    expect(res.body.data[0]).toHaveProperty('priority');
    expect(res.body.data[0].kmSinceLastMaint).toBe(100000); // 100000 - 0
  });

  it('GET /analytics/association-rules mines the job-order spare-parts join', async () => {
    const header = await adminHeader();
    const branch = await createTestBranch();
    const v = await vehicle('available');
    const partA = await prisma.sparePart.create({ data: { name: 'Brake Pad' } });
    const partB = await prisma.sparePart.create({ data: { name: 'Rotor' } });
    // Two job orders each using both parts → a co-occurrence.
    for (let i = 0; i < 2; i++) {
      const jo = await prisma.jobOrder.create({ data: { vehicleId: v.id, branchId: branch.id, status: 'repaired' } });
      await prisma.jobOrderSparePart.createMany({ data: [
        { jobOrderId: jo.id, sparePartId: partA.id, quantity: 1 },
        { jobOrderId: jo.id, sparePartId: partB.id, quantity: 1 }
      ] });
    }
    const res = await request(app).get('/api/analytics/association-rules').set('Authorization', header);
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    const rule = res.body.data[0];
    expect([rule.partA, rule.partB].sort()).toEqual(['Brake Pad', 'Rotor']);
  });

  it('403 for non-admin/non-evp roles on every analytics endpoint', async () => {
    const { user } = await createTestUser({ email: 'r@test.local', role: 'requester' });
    const h = authHeader(user.id, user.email, 'requester');
    for (const path of ['/api/analytics/dashboard', '/api/analytics/predictive-maintenance', '/api/analytics/association-rules']) {
      expect((await request(app).get(path).set('Authorization', h)).status).toBe(403);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure** — 404s.

- [ ] **Step 3: Implement**

`apps/api/src/modules/analytics/repository.ts`:

```ts
import { prisma } from '../../lib/prisma.js';

export async function vehicleStatusCounts() {
  const groups = await prisma.vehicle.groupBy({ by: ['status'], _count: { _all: true } });
  const total = await prisma.vehicle.count();
  return { groups, total };
}

export function completedTripsCount() {
  return prisma.tripTicket.count({ where: { status: 'completed' } });
}

export function vehiclesWithMaintenance() {
  return prisma.vehicle.findMany({ include: { maintenances: { orderBy: { date: 'desc' } } } });
}

// Job orders that used spare parts, with the join rows + the vehicle (for the
// optional vehicleType filter).
export function jobOrdersWithSpareParts() {
  return prisma.jobOrder.findMany({
    where: { spareParts: { some: {} } },
    include: { spareParts: true, vehicle: { select: { make: true } } }
  });
}

export function allSpareParts() {
  return prisma.sparePart.findMany({ select: { id: true, name: true } });
}
```

`apps/api/src/modules/analytics/service.ts`:

```ts
import type { AssociationRule, AssociationRulesQuery, DashboardMetrics, RiskAssessment } from '@mms/shared';
import { computeAssociationRules } from '../../lib/ml/apriori.js';
import { extractFeatures } from '../../lib/ml/features.js';
import { loadModel } from '../../lib/ml/random-forest.js';
import { computeVehicleRisk } from '../../lib/ml/risk.js';
import * as repo from './repository.js';

export async function dashboard(): Promise<DashboardMetrics> {
  const [{ groups, total }, completedTrips] = await Promise.all([repo.vehicleStatusCounts(), repo.completedTripsCount()]);
  const by = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0;
  return {
    available: by('available'),
    underMaintenance: by('under_maintenance'),
    onTrip: by('on_trip'),
    outOfService: by('out_of_service'),
    total,
    completedTrips
  };
}

export async function predictiveMaintenance(now: Date): Promise<{ data: RiskAssessment[]; count: number }> {
  const model = loadModel();
  const vehicles = await repo.vehiclesWithMaintenance();
  const data = vehicles.map((v) => {
    const features = extractFeatures({ mileage: v.mileage }, v.maintenances.map((m) => ({ date: m.date, mileage: m.mileage })), now);
    const risk = computeVehicleRisk(model, features);
    return {
      vehicleId: v.id,
      make: v.make,
      model: v.model,
      licensePlate: v.licensePlate,
      mileage: v.mileage,
      kmSinceLastMaint: features.kmSinceLastMaint,
      avgDailyKm: features.avgDailyKm,
      maintFreq12m: features.maintFreq12m,
      riskScore: risk.riskScore,
      priority: risk.priority,
      usedFallback: risk.usedFallback
    };
  });
  // Highest-risk first, matching the FE's computeFleetRiskAssessments (spec §11
  // — the dashboard's high-risk list depends on this ordering).
  data.sort((a, b) => b.riskScore - a.riskScore);
  return { data, count: data.length };
}

export async function associationRules(query: AssociationRulesQuery): Promise<{ data: AssociationRule[]; count: number }> {
  const [jobOrders, parts] = await Promise.all([repo.jobOrdersWithSpareParts(), repo.allSpareParts()]);
  const partLookup = new Map(parts.map((p) => [p.id, p.name]));
  const filtered = query.vehicleType
    ? jobOrders.filter((jo) => jo.vehicle.make.toLowerCase() === query.vehicleType!.toLowerCase())
    : jobOrders;
  const transactions = filtered.map((jo) => ({ parts: jo.spareParts.map((s) => s.sparePartId) }));
  const data = computeAssociationRules(transactions, partLookup);
  return { data, count: data.length };
}
```

`apps/api/src/modules/analytics/controller.ts`:

```ts
import type { Request, Response } from 'express';
import { associationRulesQuerySchema } from '@mms/shared';
import * as service from './service.js';

export async function dashboard(_req: Request, res: Response): Promise<void> {
  res.json(await service.dashboard());
}

export async function predictiveMaintenance(_req: Request, res: Response): Promise<void> {
  res.json(await service.predictiveMaintenance(new Date()));
}

export async function associationRules(req: Request, res: Response): Promise<void> {
  res.json(await service.associationRules(associationRulesQuerySchema.parse(req.query)));
}
```

`apps/api/src/modules/analytics/router.ts`:

```ts
import { Router } from 'express';
import { USER_ROLES } from '@mms/shared';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRole } from '../../middleware/require-role.js';
import * as controller from './controller.js';

const ANALYTICS_ROLES = [USER_ROLES.admin, USER_ROLES.evp_operations] as const;

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth, requireRole(...ANALYTICS_ROLES));
analyticsRouter.get('/dashboard', controller.dashboard);
analyticsRouter.get('/predictive-maintenance', controller.predictiveMaintenance);
analyticsRouter.get('/association-rules', controller.associationRules);
```

Mount in `apps/api/src/app.ts`:

```ts
import { analyticsRouter } from './modules/analytics/router.js';
// ...
  app.use('/api/analytics', analyticsRouter);
```

- [ ] **Step 4: Run tests to verify they pass** — full suite green; `pnpm typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: add analytics module (dashboard, predictive maintenance, association rules)"
```

---

### Task 6: Sweep + docs + live smoke

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README** — extend the API section with the gps endpoints (`POST /gps/ingest` device-key fail-closed; `GET /gps/latest`; `GET /gps/history?vehicleId=&tripId=&from=&to=&limit=`) and analytics endpoints (`GET /analytics/dashboard`, `/analytics/predictive-maintenance`, `/analytics/association-rules?vehicleType=`). Note once that gps + analytics reads are admin/evp_operations only and that ingest uses the `x-device-api-key` header (fail-closed). Document the `GPS_DEVICE_API_KEY` env var. Match the existing README style.

- [ ] **Step 2: Full sweep**

```bash
pnpm build && pnpm typecheck && pnpm --filter @mms/api test
# verify the model asset made it into the build:
ls apps/api/dist/assets/rf_maintenance_model.json
GPS_DEVICE_API_KEY=smoke-key pnpm --filter @mms/api start   # background (use PORT=3011 if 3000 is taken)
# device ingest with the key, then read back as the seeded admin:
curl -s -X POST http://localhost:3000/api/gps/ingest -H "x-device-api-key: smoke-key" -H "Content-Type: application/json" -d '{"vehicleId":"<a seeded vehicle id>","latitude":7.07,"longitude":125.6,"speed":40,"engineStatus":"on"}'
# login as the seeded admin (creds in apps/api/prisma/seed.ts), capture token, then:
curl -s http://localhost:3000/api/gps/latest -H "Authorization: Bearer <token>"                    # expect the ingested point + seeded points
curl -s http://localhost:3000/api/analytics/dashboard -H "Authorization: Bearer <token>"           # expect status counts
curl -s http://localhost:3000/api/analytics/predictive-maintenance -H "Authorization: Bearer <token>"  # expect risk scores
curl -s http://localhost:3000/api/analytics/association-rules -H "Authorization: Bearer <token>"
# kill the server
```

If any endpoint errors (e.g. the model asset didn't copy, or seed data doesn't produce association rules), report it honestly; do NOT fabricate output.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document gps and analytics endpoints"
```

---

## Self-Review Notes

- **Spec coverage:** §10 gps — ingest (fail-closed device key, gps_data insert + vehicle location update) ✔ (Task 4), latest (DISTINCT ON) ✔, history (limits) ✔; realtime NOT ported (polling only, spec-honored). §11 analytics — dashboard counts ✔ (Task 5), predictive-maintenance (feature extraction + RF inference from the JSON model + rule fallback, canonical 0.70/0.45) ✔ (Tasks 2+5), association-rules (Apriori from job_order_spare_parts, full deduped ruleset, optional ?vehicleType) ✔ (Tasks 3+5). §5 read matrix — gps + analytics = admin/evp_operations only ✔; ingest = device key (not requireAuth) ✔. §6 — collection responses `{ data, count }`, dashboard bare object ✔.
- **ML fidelity:** golden-value unit tests pin the RF path (0.18/0.30/0.33/0.38/0.915 from the committed model), the fallback path, and feature extraction with a frozen clock (Tasks 2–3). Raw-feature traversal preserved (thresholds NOT re-fixed). Injected `now` makes the otherwise-wall-clock features deterministic.
- **Model asset:** copied (not moved — FE still needs `public/ml/` until Plan 7); loaded once at init from `src/assets`; build copies to `dist/assets` so the built server finds it (Task 2 `copy-assets.mjs` + build script).
- **Type consistency:** `extractFeatures`/`loadModel`/`computeVehicleRisk`/`computeAssociationRules` defined Tasks 2–3, consumed Task 5; contract names match the Interfaces blocks; `requireDeviceKey` reads `process.env` live (documented) so per-test env changes take effect; the `DISTINCT ON` raw query is snake_case (DB columns) and joined.
- **DB/migration:** no new migration (all tables/columns exist); `TABLES` already includes `gps_data`.
- **Accepted minor (documented):** a device posting an unknown `vehicleId` hits the `gps_data` FK → `P2003` → central `409 CONFLICT` (generic). Acceptable for a misconfigured device; no pre-check added (keeps the hot ingest path a single transaction). The vehicle-location update is now inside the ingest transaction, so a denormalization-update failure discards the point too (acceptable given FK ordering — the vehicle exists, so the update won't fail on a missing row).
- **Deferred to Plan 7 (FE cutover):** remove `apps/web/public/ml/` + `src/lib/services/ml-api.ts` (Flask client) + the realtime `subscribeToGpsUpdates`/`VehicleSimulator`; point the ESP32 firmware URL at the API host; the demo GPS insert switches to `POST /gps/ingest`; the JSON-export tool that regenerates `rf_maintenance_model.json` from the `.pkl` is missing from the repo (training-pipeline gap, not a runtime blocker) — note for whoever retrains. **Response-shape gaps for the Plan 7 FE adapter to reconcile:** `/gps/latest` returns a flattened vehicle summary (make/model/licensePlate/status) — the current map popup also reads `mileage`/`fuelType`, so the adapter adds them or does a second fetch; `RiskAssessment` omits the FE's derived `reason`/`predictedFailureDate`/`lastMaintenanceDate` display helpers (Plan 7 re-derives client-side); `avgDailyKm` is returned raw (FE rounded to 1dp for display).
