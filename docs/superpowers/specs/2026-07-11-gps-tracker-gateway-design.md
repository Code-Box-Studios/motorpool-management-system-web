# GPS Tracker Gateway (SinoTrack ST-901) — Design

**Date:** 2026-07-11
**Status:** Draft for review
**Scope:** Integrate off-the-shelf SinoTrack ST-901 (2G) trackers into the Motorpool Management System for a production fleet, without changing the existing GPS ingest contract, database, or dashboard.

---

## 1. Summary & goals

Add support for physical **SinoTrack ST-901** GPS trackers so real vehicles report live location into the existing MMS dashboard, history, and analytics.

The ST-901 cannot talk to the MMS API directly: it is a sealed 2G device that opens a **raw TCP connection** to a configured server and streams a manufacturer text protocol (H02/"HQ" family), identifying itself by a device ID, not a vehicle UUID. We therefore introduce a small **gateway service** that receives the device protocol, resolves the device to a vehicle, and forwards a normal call to the existing `POST /api/gps/ingest`.

**Goals**
- Real ST-901 trackers appear on the dashboard map, history, and analytics with no changes to those features.
- One ingestion door: both the existing ESP32 firmware and the new gateway feed `POST /api/gps/ingest`.
- Devices are managed (registered, assigned to vehicles, replaced, decommissioned) by an admin.
- Runs on a small free VPS (Oracle Cloud "Always Free").
- Built in TypeScript, matching the existing stack and separation-of-concerns conventions.

**Non-goals (v1)**
- Multi-brand tracker support (fleet is all ST-901 — a single protocol).
- Two-way device control from the app (sending SMS/commands to devices).
- Geofence enforcement, trip auto-association, or driver-behaviour analytics beyond what exists.
- Real-time push to the browser (the dashboard keeps its current polling model).
- Replacing Traccar-style platforms — we build a focused adapter, not a general GPS server.

---

## 2. Background: how GPS works today

- **Ingest endpoint:** `POST /api/gps/ingest`, device-authenticated by an `x-device-api-key` header matching `GPS_DEVICE_API_KEY` (fail-closed). Body: `{ vehicleId, tripId?, latitude, longitude, speed?, heading?, engineStatus? }`.
- **Storage:** each call writes a `gps_data` row and updates the vehicle's denormalized `latitude`/`longitude`/`lastLocationUpdate`.
- **Reads:** `GET /api/gps/latest` (newest point per vehicle) and `GET /api/gps/history` feed the dashboard map and history (admin/EVP only).
- **Existing device path:** `tools/firmware/gps_esp32_supabase.ino` — a *custom* ESP32 + NEO-6M tracker over **WiFi** that POSTs JSON with a **hardcoded vehicle UUID**. This is a prototype path and is unaffected by this work.

**Why the ST-901 is different:** it is off-the-shelf (no custom firmware), uses **2G cellular** (not WiFi), speaks a **raw TCP manufacturer protocol** (not HTTP/JSON), and identifies by **device ID/IMEI** (not a vehicle UUID). Hence the gateway.

---

## 3. Constraints & assumptions

- **2G availability:** the device is 2G-only. 2G coverage on the operator/SIM used must be confirmed (several EU networks have retired 2G). This is a hard external prerequisite.
- **Public reachability:** the device dials *out* to a fixed public IP + TCP port. The gateway must run somewhere with a stable public address and an open inbound port (not serverless, not localhost).
- **Host:** Oracle Cloud "Always Free" VPS (ARM, static public IPv4, firewall control). The gateway is lightweight enough for the smallest free tier.
- **SIM:** each device needs a 2G data SIM (IoT/M2M or prepaid). Data volume is a few MB/month.
- **Single protocol:** all trackers are ST-901 (H02/HQ family), so the decoder targets one protocol.
- **Packet format must be confirmed against a real device** before finalizing the decoder (see Risks).

---

## 4. Architecture overview

```
  ST-901 (vehicle, 2G SIM)                GPS Gateway (apps/gps-gateway)              MMS API (unchanged)
  ───────────────────────                 ─────────────────────────────              ───────────────────
  dials out over GPRS to      raw TCP     TCP server ─▶ H02 decoder ─▶ registry   HTTPS  POST /api/gps/ingest
  gateway public IP:port  ───────────────▶            (pure fn)      client (cache) ────▶  x-device-api-key
  (set via SMS)               H02 frames                    │                              │  JSON body
                                                            ▼                              ▼
                                                    ingest forwarder                   gps_data +
                                                    (retry + queue)                    vehicle location
                                                            │                              │
                                              resolve deviceId→vehicleId            dashboard / history /
                                              GET /api/tracker-devices/resolve       analytics (unchanged)
```

**Data flow**
1. Tracker connects over 2G to the gateway's public IP:port.
2. Gateway reads H02 frames from the socket.
3. Decoder turns each frame into a typed value (`Position | Heartbeat | Unknown`).
4. For a valid `Position`, the registry client resolves device ID → `vehicleId` (cached).
5. The forwarder maps the position to ingest JSON and POSTs `/api/gps/ingest` with the device key.
6. The API writes `gps_data` and updates vehicle location — the dashboard, history, and analytics work unchanged.

**Key property:** the API, database, dashboard, and ESP32 firmware contract are untouched. The gateway is additive and independently deployable.

---

## 5. Components (isolated units)

The gateway is one workspace app (`apps/gps-gateway`) composed of small units, each with a single responsibility, a clear interface, and defined dependencies:

- **TCP server** — owns the socket lifecycle. Accepts connections on `GATEWAY_TCP_PORT`, buffers and frames inbound bytes into complete packets (split on the protocol terminator), applies idle timeouts, and hands each raw frame to the decoder. Depends on: Node `net`. Knows nothing about H02 or HTTP.
- **H02 decoder** — a **pure function** `decode(frame: string): DecodedFrame`. Returns a discriminated union (`{ kind: 'position', … } | { kind: 'heartbeat', … } | { kind: 'unknown', raw }`). No I/O, no state — trivially unit-tested against captured packets.
- **Registry client** — resolves the tracker's reported device ID to a `vehicleId`. Backed by `GET /api/tracker-devices/resolve?deviceId=…` (device-key auth), with an in-memory TTL cache and negative-result caching. Keeps the gateway database-free (all DB access stays in the API). Depends on: MMS API.
- **Ingest forwarder** — maps a decoded `Position` to the ingest JSON, POSTs to `/api/gps/ingest` with the device key, and handles retry/backoff plus a bounded in-memory queue for brief API outages. Depends on: MMS API.
- **Composition root / config** — wires the units together and loads env config; the only place with side effects at startup.

This mirrors the API's `module` separation (a decoder is like a pure service; the forwarder/registry are like repositories talking to an external system).

---

## 6. Field mapping & unit conversions

H02 position frame (representative) →

| Ingest field | Source in H02 frame | Conversion |
| --- | --- | --- |
| `vehicleId` | device ID (identifier after the header) | registry lookup |
| `latitude` | `ddmm.mmmm` + `N/S` | degrees + minutes/60; negative for S |
| `longitude` | `dddmm.mmmm` + `E/W` | degrees + minutes/60; negative for W |
| `speed` | speed field (knots) | × 1.852 → km/h (match the map's km/h display) |
| `heading` | course/heading field (degrees) | passthrough |
| `engineStatus` | ACC bit within the status/IO field | `'on'` / `'off'` |
| _(fix validity)_ | status `A` (valid) / `V` (invalid) | drop `V` frames (don't forward a stale/invalid fix) |
| _(timestamp)_ | date + time (UTC) | v1 uses server receipt time (`gps_data.createdAt`); device time is logged only |

Exact byte offsets/field order are locked once real device output is captured (see Risks). Raw frames are always logged so mis-decodes are diagnosable.

---

## 7. Device registry

The tracker only knows its own ID, so we need a mapping to a vehicle.

**Data model — new `TrackerDevice` (Prisma, matching existing conventions):**
- `id` — uuid PK.
- `imei` — String `@unique` (the identifier the device reports; column `imei`).
- `vehicleId` — uuid FK → `Vehicle`, nullable (a device can be a registered spare, unassigned).
- `label` — String? (human name, e.g. "Van 1 tracker").
- `simNumber` — String? (the SIM's phone number, for provisioning/support).
- `status` — enum `TrackerDeviceStatus { active, inactive, decommissioned }`, default `active`.
- `lastSeenAt` — DateTime? (stamped by the resolve endpoint; drives online/offline).
- `notes` — String?.
- `createdAt` / `updatedAt`.
- Indexes: unique `imei`; index `vehicleId`.
- `Vehicle` gains a back-relation `trackerDevices TrackerDevice[]` (at most one `active` per vehicle, enforced in the service).

**API module — new `tracker-devices` (mirrors router/controller/service/repository):**
- `GET /api/tracker-devices` — list (admin). Optional `?vehicleId=`, `?status=`.
- `GET /api/tracker-devices/:id` — detail (admin).
- `POST /api/tracker-devices` — register (admin): `imei`, `label?`, `simNumber?`, `vehicleId?`.
- `PATCH /api/tracker-devices/:id` — reassign vehicle / change status / label (admin).
- `DELETE /api/tracker-devices/:id` — decommission (admin).
- `GET /api/tracker-devices/resolve?deviceId=…` — **gateway-only**, authenticated by the same `x-device-api-key` middleware as ingest. Returns `{ vehicleId }` for an `active` device, `404` otherwise, and stamps `lastSeenAt`. Unknown/inactive IMEIs are rejected — the registry is the device allowlist.

**Admin UI — new "Trackers" management page** (admin-only, mirrors User Management): list devices with online/offline (from `lastSeenAt`), register a device, assign/replace the vehicle, decommission. The assigned tracker is also surfaced on the Vehicle detail page.

Shared contracts (`packages/shared`) get the `TrackerDevice` zod schemas + types, consistent with the other modules.

---

## 8. Configuration

Gateway env (`apps/gps-gateway/.env`):

| Var | Purpose |
| --- | --- |
| `GATEWAY_TCP_PORT` | Port the trackers connect to (opened in the VPS firewall). |
| `MMS_API_URL` | Base URL of the MMS API (e.g. `https://api.example.com`). |
| `GPS_DEVICE_API_KEY` | Shared device key — same value as the API's, used for ingest and resolve. |
| `REGISTRY_CACHE_TTL_MS` | How long a resolved IMEI→vehicle mapping is cached. |
| `OFFLINE_AFTER_MS` | Threshold for marking a device offline (dashboard/registry). |
| `LOG_LEVEL` | Logging verbosity. |

No new **required** API env vars; the API already has `GPS_DEVICE_API_KEY`. (The resolve endpoint reuses it.)

---

## 9. Reliability & error handling

- **Invalid fixes:** frames with status `V` (no GPS lock) are logged and not forwarded.
- **Heartbeats/keepalive:** decoded and used to refresh `lastSeenAt` (via resolve) without creating a position row; sockets get an idle timeout and are closed if silent too long. Devices reconnect on their own.
- **API outages:** the forwarder retries with backoff and holds a bounded in-memory queue; when full, oldest positions are dropped (with a warning log) rather than growing unbounded.
- **Offline detection:** a device not seen within `OFFLINE_AFTER_MS` is shown offline in the Trackers UI / dashboard.
- **Malformed frames:** decoded as `unknown`, logged with the raw bytes, never crash the connection.
- **Duplicate/rapid frames:** optional minimal rate-limit per device to avoid flooding ingest.

---

## 10. Security & threat model

- The gateway holds `GPS_DEVICE_API_KEY`; devices never see it. Devices authenticate only by their reported IMEI.
- **Spoofing:** cheap trackers don't cryptographically authenticate, so a reported IMEI is inherently trust-on-first-use. Mitigations: only **registered, active** IMEIs are accepted (registry = allowlist); optional source-IP allow-listing; the port exposes only the gateway, not the API/DB.
- **Transport:** the device↔gateway link is plain 2G TCP (no TLS possible on the device) — an accepted limitation of this hardware class. The gateway↔API hop is HTTPS.
- **Firewall:** only `GATEWAY_TCP_PORT` is opened inbound on the VPS; everything else stays closed.

---

## 11. Deployment & device provisioning

**Gateway (Oracle Always Free VPS):**
- Run as a `systemd` service (auto-restart on crash/boot); `pm2` or Docker are alternatives.
- Open `GATEWAY_TCP_PORT` in both the VM firewall and the Oracle security list.
- Config via env; logs to journald/file.

**Per-device provisioning (SMS to the tracker's SIM):**
- Set the **APN** for the SIM's carrier.
- Set the **server** to the gateway's public IP + `GATEWAY_TCP_PORT`.
- Set the **reporting interval**.
- Insert an active **2G data SIM**; note its number in the registry (`simNumber`).
- Register the device's IMEI in the Trackers UI and assign it to a vehicle.

(The exact SMS command strings for the ST-901 go in the gateway README as a cheat-sheet.)

---

## 12. Testing strategy

- **Decoder unit tests** — valid position, invalid (`V`) fix, heartbeat, malformed, N/S/E/W hemispheres, ACC on/off — against **real captured packets** plus synthetic ones.
- **Forwarder tests** — correct ingest JSON; retry/backoff on API error; queue drop when full (mock API).
- **Registry client tests** — cache hit/miss, negative caching, unknown IMEI → skip.
- **Integration test** — open a real TCP socket to the gateway, send raw frames, assert an ingest call with the right body (mock/stub API).
- **Device simulator** — a small script that replays H02 frames to the gateway (like the ESP32 sim) for local and dashboard testing.

---

## 13. Documentation updates ("update all docs")

Doc updates are a first-class deliverable of this feature, done as part of implementation:
- **New** `apps/gps-gateway/README.md` — what it is, config/env, running as a service, and the ST-901 SMS provisioning cheat-sheet.
- **Root `README.md`** (functional guide) — Section 12 "Live GPS tracking" updated to describe the real hardware path (SinoTrack → gateway → ingest) alongside the demo, and the "Trackers" admin area.
- **`docs/DEVELOPER_GUIDE.md`** — add the `tracker-devices` endpoints, the gateway to the monorepo layout/architecture, and the new gateway env vars.
- **`tools/firmware`** — a short note distinguishing the two device paths (custom ESP32 firmware vs off-the-shelf ST-901 gateway).
- **This spec** stays as the design record.

---

## 14. Risks & open questions

- **[High] Exact packet format** — ST-901 firmware revisions vary. **Mitigation:** capture real output from the actual device first (point it at the gateway or a raw TCP logger) and lock the decoder to it; always log raw frames. This is the first implementation step.
- **[High] 2G coverage** — external prerequisite; confirm with the SIM's operator before rollout.
- **[Med] Device ID vs IMEI** — the ID the device reports may be the IMEI or a derived number; the registry keys on whatever the device actually sends (confirmed during capture).
- **[Med] Speed unit** — confirm knots→km/h against the device and the map's displayed unit.
- **[Low] One active device per vehicle** — enforced in the service; replacement flow decommissions the old device.

---

## 15. Rollout / phasing

1. **Capture** real ST-901 output; lock the decoder (tests from real frames).
2. **Registry**: `TrackerDevice` model + migration, `tracker-devices` API module, shared contracts, admin UI, resolve endpoint.
3. **Gateway**: TCP server + decoder + registry client + forwarder; unit/integration tests; simulator.
4. **Deploy** to the VPS; provision one device; verify end-to-end on the dashboard.
5. **Docs** updated across the set above.
6. **Fleet rollout**: register + provision remaining devices.
