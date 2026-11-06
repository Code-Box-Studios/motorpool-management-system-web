# Tracker Packet Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let administrators inspect every received tracker message, raw payload, decoded position, and processing outcome.

**Architecture:** Capture H02 frames and discarded fragments at the gateway, persist receipt/outcome updates in a disk spool, and upload idempotently to a dedicated API log table. The React viewer uses the same identity across registration and vehicle reassignment.

**Tech Stack:** TypeScript, Node TCP/fs, Express, Zod, Prisma/Postgres, React, TanStack Query/Router, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-tracker-packet-logs-design.md`

## Global Constraints

- Work directly on `main`; do not commit or push unless requested.
- Capture starts after updated gateway deployment; do not present sample data as real tracker traffic.
- Gateway-key authenticated writes; administrator-only reads and frontend.
- Preserve exact bytes, repeated packets, unknown IDs, and failure outcomes.
- Logs must not change vehicle location or tracker liveness by themselves.
- No automatic record deletion or retention change.
- Use current application styling and components.

## Review Focus

- A final outcome arriving before its receipt retry must never regress to pending.
- A deleted or reassigned device must retain its original packet identity.
- Binary prefixes and incomplete socket closes must not silently vanish.
- A full disk or API outage must not silently claim successful capture or forwarding.
- Refreshing a filtered/older page must not mix devices or move records unpredictably.

## Shared interface

Endpoint: `POST /api/gps/packet-logs` accepts one `TrackerPacketBody`; `GET /api/gps/packet-logs` accepts `TrackerPacketQuery` and returns `TrackerPacketPage`.

Export shared enums `TRACKER_PACKET_KINDS` = `position`, `heartbeat`, `unknown`, `fragment`, `socket_error`; `TRACKER_PACKET_OUTCOMES` = `received`, `saved`, `heartbeat`, `invalid_fix`, `device_unavailable`, `unsupported`, `incomplete`, `oversized`, `resolution_error`, `forward_error`, `socket_error`.

`TrackerPacketBody` contains `id: string` (UUID), `revision: 0 | 1` (0 receipt, 1 final outcome), `receivedAt: string` (ISO UTC), `connectionId: string` (UUID), `peer: string`, `deviceId: string | null`, `vehicleId: string | null` (UUID snapshot), `messageType: string | null`, `kind`/`outcome` (enums), `rawHex: string` (even hexadecimal, <= 16384 chars, <=8192 bytes), `fixTime: string | null` (ISO UTC), `latitude`, `longitude`, `speed`, `heading` (finite numbers or null), `ignition: boolean | null`, `reason: string | null` (<=2000 chars). Other text fields are bounded (peer 256, device 128, message type 32). Revision 0 requires outcome received; revision 1 requires a final outcome. Preserve out-of-range finite decoded values as diagnostics; only valid fixes can reach location ingest.

`TrackerPacketLog = TrackerPacketBody & { storedAt: string }`. `TrackerPacketQuery` has optional `deviceId` (exact), `search` (partial ID), `outcome`, `kind`, `from`, `to`, `cursor`; `limit` defaults to25, maximum100. `TrackerPacketPage = { data: TrackerPacketLog[]; count: number; nextCursor: string | null }`. Sort receivedAt desc, id desc. The cursor represents the last row's receivedAt/id and is validated independently of row existence.

### Task 1: Contracts, database, and API

**Files:** create `packages/shared/src/contracts/tracker-packets.ts` and tests; export from `packages/shared/src/index.ts`; extend `apps/api/prisma/schema.prisma`, add migration; create `apps/api/src/modules/gps/packet-logs.ts` and API tests; wire `apps/api/src/modules/gps/router.ts`; update test DB cleanup as needed.

**Interfaces:** consumes the shared interface above; produces schema/type exports, upload endpoint, and admin listing endpoint.

- [x] Write tests for valid bodies, bounds, malformed hex/date/UUID, revision/outcome compatibility, and query limits/ranges.
- [x] Run shared tests and observe missing-contract failures before implementation.
- [x] Implement contract and exports, then build shared.
- [x] Write API tests for auth, receipt creation, idempotency, out-of-order revisions, original identity preservation, filters, stable cursor pages, raw byte preservation, and no GPS/liveness side effects.
- [x] Run the new API test and observe missing endpoint/table failures.
- [x] Add additive log table/migration and idempotent monotonic persistence; validate identities on duplicate updates. Add indexes for time and exact device/time listing. Implement admin filters and cursor pagination.
- [x] Run shared tests, packet API tests, and API typecheck. Verify migrations on local/test databases only, never reset populated development data.

### Task 2: Gateway capture and durable upload

**Files:** modify `apps/gps-gateway/src/framing.ts`, `tcp-server.ts`, `gateway.ts`, `registry.ts`, `forwarder.ts`, `config.ts`, `main.ts`; create `packet-log.ts` and `packet-log.test.ts`; extend existing gateway/framing/registry tests; update gateway `.env.example`, README and deployment unit/runbook. Add shared workspace dependency if needed.

**Interfaces:** produces POST bodies from the shared interface; adds injectable packet recorder with asynchronous `record(body): Promise<void>` and lifecycle `close(): Promise<void>` for tests/shutdown. TCP callbacks carry a connection UUID. Existing injected gateway dependencies remain backward compatible for old tests.

- [x] Add failing tests for rejected/valid/heartbeat/unknown packets, fragmented/coalesced TCP, binary prefixes, incomplete close, oversized input, and lookup/forward failures.
- [x] Add failing disk-spool tests for restart replay, repeated receipt identity, upload outage, final revision order, and explicit capacity failures.
- [x] Implement bounded framing diagnostics without losing bytes; record receipt before validation/routing, then the final outcome. Lookup errors throw distinct errors rather than returning unknown-device results. Add request timeouts.
- [x] Implement disk-backed queue with atomic per-event files, safe serialized mutations and capacity checks, retry/backoff, idempotent IDs and ordered revisions. Disk errors must be explicit. Use persistent deployment state directory outside build files.
- [x] Run all gateway tests and typecheck/build; preserve existing position behavior.

### Task 3: Frontend log viewer

**Files:** create `apps/web/src/lib/api/tracker-packets.ts`, query hook, `apps/web/src/components/pages/tracker-logs/index.tsx`, and `apps/web/src/routes/_authenticated/tracker-logs.tsx`; modify Tracker Devices list/details entry links; generate route tree through existing tooling; add focused browser tests.

**Interfaces:** consumes shared exported types and GET endpoint. Route `/tracker-logs` accepts optional search `deviceId`; tracker detail links set exact observed ID. Backend access is admin-only; wrap the route with existing `AdminOnly`.

- [x] Add browser regression checks for route access, filtering, raw text/hex detail, empty/error states, and older-page refresh behavior. Observe missing-view failure.
- [x] Implement newest-first cursor listing, search/exact device filter, outcome/kind/date filters, manual and optional5-second refresh, real last-success refresh time, preserved older-page position, and visible errors even with cached rows.
- [x] Use native app components, keyboard-accessible modal, timezone-labeled receipt/fix times, explicitly invalid coordinate labels, escaped raw payload, and mobile table scrolling.
- [x] Verify backend-driven rows and route links, then run web build/lint.

### Task 4: Integration and review

**Files:** update design/plan status and documentation with actual behavior and commands.

- [x] Exercise TCP-to-database-to-browser with clearly identified local diagnostic traffic, never mark sample traffic as real tracker evidence.
- [x] Run shared and gateway suites, full API suite, API typecheck, gateway build, web build/lint, and `git diff --check`.
- [x] Request one independent review of the complete change; fix material findings with regression tests.
- [x] Report usable local viewer URL, verification results, and deployment boundary. Do not push or deploy without instruction.

## Execution notes

User approved implementation. Resolve ordinary implementation choices without another approval gate. API and frontend can be delegated in parallel against the fixed shared interface while the primary agent implements gateway capture; agents own disjoint files. This follows the parallel-agent skill and avoids concurrent edits. No commits are authorized.

## Delivery verification

Implemented on `main` without commits, pushes, or production deployment. Local viewer: http://localhost:5174/tracker-logs. Development packet-log migration applied. Six explicitly named `LOCAL-LOG-CHECK` diagnostic TCP receipts verified through the gateway, database, and populated browser view; these are not physical tracker traffic.

Verified shared94tests, gateway53tests, eight browser regressions, a full isolated API run of692tests, and six additional API NUL-validation regressions. API production build, gateway/shared builds and typechecks, web build/lint, portable runtime packaging, and diff whitespace checks passed. Independent review found shutdown-fragment loss and missing runtime deployment dependencies; both were fixed and verified. Portable packaging now excludes local environment files.

The concurrent configuration test typecheck issue was corrected by its owner. The user subsequently authorized the combined deployment. Fresh combined checks passed: 699 API tests, 94 shared tests, 53 gateway tests, 29 browser checks, production builds, typechecks and web lint. A second read-only release review found no remaining material packet-code issues.

The existing Google Cloud VM rejects this computer's SSH key. Added a separate-release Cloud Shell updater with configuration/source preservation, API preflight, persistent spool settings and failed-start rollback. Review fixed an EnvironmentFile override risk by pinning PACKET_LOG_DIR in ExecStart. Syntax, package imports, environment-file exclusion and three orchestration scenarios passed. API/frontend rollout must precede this VM update; a new physical tracker receipt is still required to verify live capture.
