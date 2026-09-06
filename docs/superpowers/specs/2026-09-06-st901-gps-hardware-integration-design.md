# ST-901 GPS Hardware Integration — Design

**Date:** 2026-09-06
**Status:** Approved
**Type:** Ops / deployment (no code changes)

## Goal

Take the existing, so-far-unverified GPS pipeline live with a real SinoTrack ST-901
tracker: positions from the physical device flow through the deployed gateway into
`POST /api/gps/ingest` and appear as a live marker on the dashboard map.

## Context

The software stack is complete and untested in production: H02 TCP gateway
(`apps/gps-gateway`), ingest module (`apps/api/src/modules/gps`), tracker-device
registry + admin UI, dashboard vehicle map. The runbook (`docs/gps-deployment.md`)
prescribes three verification tiers; per explicit user decision this integration goes
**straight to Tier 3 hardware**, keeping only the in-tier simulator smoke test (§3.4)
as a checkpoint. Hardware prerequisites are confirmed: ST-901 in hand, SIM with
load/data tested in a phone, carrier 2G coverage confirmed.

## Decisions

- **Approach:** straight to hardware (runbook Tier 3), skipping Tier 1 (browser demo)
  and Tier 2 (local gateway + simulator) as separate phases.
- **Keep the §3.4 smoke test:** after the gateway is live on the VM, run the simulator
  from the laptop against the VM's public IP. Proves IP, port, firewall, device key,
  API, and map in ~2 minutes, before the slow SMS/APN/GPS-fix variables enter.
- **Skip the Vercel `VITE_GPS_DEVICE_KEY`:** it only powers the browser demo, which the
  hardware path does not use. Can be added later if the demo is ever wanted.
- **Hosting:** Google Cloud `e2-micro` per the runbook — the always-free shape
  (US region, 30 GB standard disk) plus a **reserved** static external IP
  (~$3.65/month), reserved *before* VM creation because the address is burned into the
  tracker by SMS and must never move.

## Steps

1. **Device key.** Generate a secret (`openssl rand -hex 24`); user sets
   `GPS_DEVICE_API_KEY` on the Render API service.
   *Verify:* curl with a wrong key returns **401** (500 = key not set).
2. **Provision the VM.** One Cloud Shell block (runbook §3.1–3.2): reserve static IP →
   create `e2-micro` in the always-free shape → firewall rule `tcp:5013` scoped to the
   VM's network tag. No host firewall step on GCP Ubuntu images.
3. **Install the gateway.** Cloud Shell/SSH block (runbook §3.3): Node 22, clone,
   `pnpm install`, build, `.env` (API URL, device key, `SPEED_UNIT=knots`), systemd
   unit written with an **unquoted** heredoc so `$USER`/`$HOME` expand.
   *Verify:* `journalctl -u mms-gps-gateway -f` shows `listening on tcp/5013`.
4. **Smoke test.** Register a fake device (IMEI `1234567890`) in Trackers, assigned
   to the same vehicle the real tracker will use, then from
   the laptop: `pnpm --filter @mms/gps-gateway simulate 1234567890 VM_IP 5013`.
   *Verify:* assigned vehicle moves on the deployed map. Deactivate the fake device
   afterwards (one active device per vehicle).
5. **Configure the tracker by SMS** (runbook §3.5): APN (`8030000 <apn>`), server
   (`8040000 VM_IP 5013`), report intervals (defaults fine). Device powered on 12 V,
   outdoors for first GPS fix (can take minutes). Each accepted command replies
   **SET OK**.
6. **Register the real device** (runbook §3.6): read the exact device ID from the
   gateway's "unregistered/unassigned" log line — H02 devices often do **not** send
   the full IMEI, so never guess. Register that ID in Trackers → Register Device,
   assign the vehicle, set Active, then restart the gateway (clears the 5-minute
   unknown-device cache).

## Failure handling

No tiered verification means failures are debugged backwards down the chain, using the
runbook's troubleshooting matrix:

1. Frames in `journalctl`? No → SMS config / APN / 2G / power.
2. `dropping void fix`? → no GPS lock; outdoors, wait.
3. "unregistered/unassigned"? → register the logged ID, restart gateway.
4. Forwarder 401/500? → key mismatch on Render / `MMS_API_URL` wrong / Render asleep.
5. Frames forwarded but no marker? → device→vehicle assignment, or two active devices
   on one vehicle.
6. Speeds ~2× off? → flip `SPEED_UNIT` between `knots`/`kmh`, restart.

The step-4 smoke test cuts this search space in half by pre-proving everything from
the VM inward.

## Success criteria

- `journalctl` shows frames from the device's real ID being forwarded.
- The assigned vehicle's marker moves live on the deployed dashboard map.
- Trackers page shows the device **Online**.

## Division of labor

- **Claude:** generate the secret, pre-fill every command block with real values, run
  the curl verifications and the simulator from this machine, watch for/diagnose
  failures.
- **User:** Render dashboard (env var), Cloud Shell pastes (VM + gateway), sending the
  SMSes, physically handling the device.

## Inputs needed at execution time

- Render API URL (`https://….onrender.com`)
- Telco APN (and credentials, if any)
- Which vehicle the tracker is assigned to
- GCP project ID (free trial activated, budget alert recommended per runbook §3.1)
