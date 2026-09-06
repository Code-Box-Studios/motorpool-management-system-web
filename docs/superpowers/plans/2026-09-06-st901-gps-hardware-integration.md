# ST-901 GPS Hardware Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A physical SinoTrack ST-901 tracker reports live positions that appear as a moving marker on the deployed dashboard map.

**Architecture:** No code changes. Ops only: shared device key on Render → gateway on a GCP `e2-micro` with a reserved static IP → simulator smoke test → tracker pointed at the VM by SMS → device registered in the Trackers admin UI. Spec: `docs/superpowers/specs/2026-09-06-st901-gps-hardware-integration-design.md`. Runbook being executed: `docs/gps-deployment.md` (Tier 3).

**Tech Stack:** Render (API), GCP Compute Engine + Cloud Shell, systemd, `apps/gps-gateway` (Node 22 / pnpm), SMS provisioning.

## Global Constraints

- **This plan is interactive.** Steps marked **[USER]** need the user's accounts or hands (Render dashboard, Cloud Shell, sending SMS, web-app clicks). Give the user the exact block/instruction, then wait for their confirmation or output before proceeding. Steps marked **[LOCAL]** run on this machine.
- **Reserve the static IP before creating the VM** — the address is burned into the tracker by SMS and must never change.
- **Always-free VM shape, exactly:** `e2-micro`, region `us-west1`/`us-central1`/`us-east1`, boot disk `pd-standard` 30 GB. Any other region or disk type is billed.
- **systemd unit heredoc must be unquoted** (`<<EOF`, not `<<'EOF'`) so `$USER`/`$HOME` expand — GCP logins are not `ubuntu`.
- **One active tracker device per vehicle.** The Task-4 fake must be set Inactive before the real device is activated on the same vehicle.
- **The gateway caches unknown-device answers for 5 minutes** — after registering any device, restart the gateway.
- **Never guess the device ID.** H02 trackers often send an ID that is not the full IMEI; always read it from the gateway log.
- Do not modify any source files. The only repo changes this plan makes are checkbox ticks in this document.

## Execution Inputs

Collect from the user at the start; substitute everywhere the token appears:

| Token | Meaning |
|---|---|
| `<RENDER_API_URL>` | Deployed API base URL, e.g. `https://mms-api.onrender.com` |
| `<GCP_PROJECT>` | GCP project ID (free trial activated) |
| `<APN>` (+ optional `<APN_USER> <APN_PASS>`) | Telco APN for the SIM |
| `<VEHICLE>` | The vehicle (name/plate) the tracker is assigned to |
| `<SECRET>` | Generated in Task 1, Step 1 |
| `<VM_IP>` | Printed by Task 2, Step 1 |

---

### Task 1: Shared device key on Render

**Files:** none (env var on Render only).

**Interfaces:**
- Consumes: `<RENDER_API_URL>` from Execution Inputs.
- Produces: `<SECRET>` — used by the gateway `.env` (Task 3) and never printed anywhere else.

- [x] **Step 1: [LOCAL] Generate the secret**

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Save the output as `<SECRET>`.

- [x] **Step 2: [USER] Set it on Render**

Render dashboard → the API service → **Environment** → add `GPS_DEVICE_API_KEY=<SECRET>` → Save (service redeploys). Wait until the deploy is live.

- [x] **Step 3: [LOCAL] Verify fail-closed auth**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST <RENDER_API_URL>/api/gps/ingest -H "x-device-api-key: wrong"
```

Expected: `401` (`INVALID_DEVICE_KEY`).
`500` means `GPS_NOT_CONFIGURED` — the env var is not set/live yet; re-check Step 2.
First request may be slow if the Render service was asleep.

---

### Task 2: Provision the GCP VM and open tcp/5013

**Files:** none (cloud resources only).

**Interfaces:**
- Consumes: `<GCP_PROJECT>`.
- Produces: `<VM_IP>` (reserved static external IP) and a running Ubuntu 24.04 `e2-micro` named `mms-gps-gateway` with tcp/5013 open, SSH-able via `gcloud compute ssh mms-gps-gateway --zone=us-central1-a`.

- [ ] **Step 1: [USER] Budget alert, then paste the provisioning block in Cloud Shell**

First, in the console: Billing → Budgets & alerts → create a ₱500 budget with alerts at 50/90/100%.

Then paste (Cloud Shell, `>_` icon in the console header):

```bash
PROJECT=<GCP_PROJECT>
REGION=us-central1
ZONE=us-central1-a

gcloud config set project $PROJECT
gcloud services enable compute.googleapis.com

# Reserve the IP BEFORE the VM — it gets burned into the tracker by SMS.
gcloud compute addresses create mms-gps-ip --region=$REGION

# Exact Always-Free shape: e2-micro, US region, 30 GB *standard* disk.
gcloud compute instances create mms-gps-gateway \
  --zone=$ZONE \
  --machine-type=e2-micro \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-type=pd-standard \
  --boot-disk-size=30GB \
  --address=mms-gps-ip \
  --tags=mms-gps

gcloud compute firewall-rules create allow-mms-gps-5013 \
  --allow=tcp:5013 \
  --target-tags=mms-gps \
  --source-ranges=0.0.0.0/0

gcloud compute instances describe mms-gps-gateway --zone=$ZONE \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
```

Expected: the last line prints an IPv4 address — record it as `<VM_IP>`.

- [ ] **Step 2: [USER] Confirm the IP is the reserved one**

```bash
gcloud compute addresses list
```

Expected: `mms-gps-ip` shows status `IN_USE` with address `<VM_IP>`. (`RESERVED` would mean the VM took an ephemeral IP instead — reattach before going further.)

---

### Task 3: Install the gateway under systemd

**Files:** on the VM only — `~/motorpool-management-system-web`, `apps/gps-gateway/.env`, `/etc/systemd/system/mms-gps-gateway.service`.

**Interfaces:**
- Consumes: `<VM_IP>` (SSH target), `<RENDER_API_URL>`, `<SECRET>`.
- Produces: gateway listening on `tcp/5013`, forwarding to `<RENDER_API_URL>/api/gps/ingest`, auto-restarting via the `mms-gps-gateway` systemd unit.

- [ ] **Step 1: [USER] SSH in and install**

`gcloud compute ssh mms-gps-gateway --zone=us-central1-a`, then paste (replace the two placeholders in the `.env` block):

```bash
sudo apt-get update && sudo apt-get install -y git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo corepack enable

git clone https://github.com/Code-Box-Studios/motorpool-management-system-web.git
cd motorpool-management-system-web
pnpm install --frozen-lockfile
pnpm --filter @mms/gps-gateway build

cat > apps/gps-gateway/.env <<'EOF'
GATEWAY_TCP_PORT=5013
MMS_API_URL=<RENDER_API_URL>
GPS_DEVICE_API_KEY=<SECRET>
SPEED_UNIT=knots
EOF
```

Expected: build completes without errors; `.env` exists with the real URL and secret.

- [ ] **Step 2: [USER] Write and start the systemd unit**

Still on the VM — note the **unquoted** `EOF` (constraint: `$USER`/`$HOME` must expand):

```bash
sudo tee /etc/systemd/system/mms-gps-gateway.service > /dev/null <<EOF
[Unit]
Description=MMS GPS gateway (H02 TCP -> API ingest)
After=network-online.target
Wants=network-online.target

[Service]
User=$USER
WorkingDirectory=$HOME/motorpool-management-system-web/apps/gps-gateway
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now mms-gps-gateway
journalctl -u mms-gps-gateway -n 20 --no-pager
```

Expected: log shows `GPS gateway listening on tcp/5013`. An immediate crash-loop with a permissions error means the heredoc was quoted — rewrite with unquoted `EOF`.

- [ ] **Step 3: [LOCAL] Verify the port is reachable from the internet**

```powershell
Test-NetConnection <VM_IP> -Port 5013
```

Expected: `TcpTestSucceeded : True`. `False` → firewall rule/tag mismatch (Task 2 Step 1) or gateway not listening (Step 2).

---

### Task 4: Simulator smoke test from the laptop

**Files:** none.

**Interfaces:**
- Consumes: `<VM_IP>`, fake IMEI `1234567890`, `<VEHICLE>`.
- Produces: proof that VM → gateway → API key → ingest → map all work; fake device left registered but **Inactive**.

- [ ] **Step 1: [USER] Register the fake device**

Web app (as an admin) → **Trackers → Register Device**: IMEI `1234567890`, assign `<VEHICLE>`, status Active.

- [ ] **Step 2: [USER] Restart the gateway** (clears the 5-minute unknown-device cache)

```bash
sudo systemctl restart mms-gps-gateway
```

- [ ] **Step 3: [LOCAL] Run the simulator against the VM**

```bash
pnpm --filter @mms/gps-gateway simulate 1234567890 <VM_IP> 5013
```

Expected: `simulator connected to <VM_IP>:5013 as 1234567890`, then `sent *HQ,...` lines every 3 s.

- [ ] **Step 4: [USER] Verify end to end**

Watch for ~30 s, then stop the simulator (Ctrl+C):
- VM: `journalctl -u mms-gps-gateway -f` shows the frames being forwarded (no 401/500 from the forwarder).
- Deployed dashboard map: `<VEHICLE>`'s marker moves through Davao City within ~10 s.

If the marker doesn't move: forwarder 401 → `<SECRET>` mismatch between Render and the VM `.env`; "unregistered/unassigned" → Step 1 registration or a missed restart; no frames at all → Task 3 Step 3.

- [ ] **Step 5: [USER] Deactivate the fake device**

Trackers page → device `1234567890` → set status **Inactive** (constraint: one active device per vehicle; the real tracker takes this vehicle in Task 6).

---

### Task 5: Configure the ST-901 by SMS

**Files:** none.

**Interfaces:**
- Consumes: `<VM_IP>`, `<APN>` (+ credentials if any); tracker powered on 12 V with the SIM inserted.
- Produces: the tracker streaming H02 frames to `<VM_IP>:5013`; its real device ID visible in the gateway log.

- [ ] **Step 1: [USER] Send the configuration SMSes to the SIM's number**

Default password `0000`; each accepted command replies **SET OK**:

| Purpose | SMS |
|---|---|
| APN | `8030000 <APN>` — with credentials: `8030000 <APN> <APN_USER> <APN_PASS>` |
| Server | `8040000 <VM_IP> 5013` |
| Interval, ignition ON (optional, default fine) | `8050000 20` |
| Interval, ignition OFF (optional, default fine) | `8090000 300` |

Expected: **SET OK** reply to each. No reply → SIM lacks load/SMS or device unpowered; re-test the SIM in a phone.

- [ ] **Step 2: [USER] Take the tracker outdoors and watch the gateway log**

First GPS fix can take several minutes. On the VM:

```bash
journalctl -u mms-gps-gateway -f
```

Expected: frames arriving from an unknown ID — a warning line like `unregistered/unassigned` containing the exact device ID. **Record that ID verbatim** (constraint: never guess; it is often not the full IMEI).

`dropping void fix` lines are fine — no GPS lock yet; wait outdoors.
Nothing at all after ~10 min → wrong APN, no data plan, or no 2G coverage at that spot; re-verify tcp/5013 with the Task 4 simulator from a phone hotspot.

---

### Task 6: Register the real device and verify live tracking

**Files:** none.

**Interfaces:**
- Consumes: the device ID recorded in Task 5 Step 2; `<VEHICLE>` (fake device already Inactive from Task 4 Step 5).
- Produces: the spec's success criteria — frames forwarded, marker live, Trackers page **Online**.

- [ ] **Step 1: [USER] Register the logged ID**

Web app → **Trackers → Register Device**: IMEI/ID = exactly the logged ID, assign `<VEHICLE>`, status Active.

- [ ] **Step 2: [USER] Restart the gateway** (5-minute cache)

```bash
sudo systemctl restart mms-gps-gateway
```

- [ ] **Step 3: [USER] Verify all three success criteria**

1. VM: `journalctl -u mms-gps-gateway -f` shows frames from the real ID being **forwarded** (no "unregistered" warnings, no forwarder errors).
2. Deployed dashboard map: `<VEHICLE>`'s marker at the tracker's actual location, updating as it moves.
3. Trackers page: the device shows **Online**. (Known quirk: the Online dot can lag up to 5 min; the map is the source of truth.)

- [ ] **Step 4: [USER] Sanity-check speed while moving**

Drive or carry the tracker; if dashboard speeds read ~2× off, flip `SPEED_UNIT` in `apps/gps-gateway/.env` on the VM between `knots`/`kmh` and `sudo systemctl restart mms-gps-gateway`.

- [ ] **Step 5: [LOCAL] Tick the checkboxes and commit this plan's progress**

```bash
git add docs/superpowers/plans/2026-09-06-st901-gps-hardware-integration.md
git commit -m "docs: mark ST-901 GPS integration plan complete"
```
