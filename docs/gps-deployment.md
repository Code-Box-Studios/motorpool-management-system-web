# GPS Deployment Runbook

One guide, three tiers. Climb only as far as the day requires:

| Tier | What it proves | Needs | Time |
|---|---|---|---|
| **1 — Browser demo** | Map works on the deployed site | Two env vars | ~5 min |
| **2 — Simulator pipeline** | The real gateway → API path works | Laptop + repo | ~15 min |
| **3 — Real hardware** | Live ST-901 trackers in vehicles | Google Cloud VM + tracker + SIM | ~half a day |

```mermaid
flowchart LR
  T["ST-901 tracker"] -->|"TCP H02 :5013"| G["Gateway"]
  S["Simulator (Tier 2)"] -.-> G
  G -->|"POST /api/gps/ingest + device key"| A["API (Render)"]
  B["Browser demo (Tier 1)"] -.->|same ingest endpoint| A
  A --> M["Dashboard map (polls 5 s)"]
```

Positions flow into `/api/gps/ingest` authenticated by a shared device key; the map polls the latest point per vehicle every 5 seconds. Tiers 1–2 fake the tracker at different depths; Tier 3 is the real thing.

---

## 0. Once-only setup

1. Generate a secret: `openssl rand -hex 24`
2. **Render** → API service → Environment → `GPS_DEVICE_API_KEY=<secret>` → save.
3. **Vercel** → FE project → Settings → Environment Variables → `VITE_GPS_DEVICE_KEY=<same secret>` → redeploy the FE (Vite bakes env at build).

**✓ Verify:** `curl -X POST https://YOUR-API.onrender.com/api/gps/ingest -H "x-device-api-key: wrong"` returns 401 (not 500 — a 500 means the key isn't set).

---

## Tier 1 — Browser demo

1. Open the deployed dashboard as `admin@mms.local`.
2. Vehicle Tracking card → **Start Demo**.

**✓ Verify:** a marker drives through Davao City on the map.

If it doesn't: `VITE_GPS_DEVICE_KEY` missing/mismatched or FE not redeployed after setting it — check the browser console for 401s on `/api/gps/ingest`.

---

## Tier 2 — Simulator through the real gateway

Runs the actual gateway on your laptop, pointed at the deployed API.

1. Create `apps/gps-gateway/.env`:
   ```ini
   GATEWAY_TCP_PORT=5013
   MMS_API_URL=https://YOUR-API.onrender.com
   GPS_DEVICE_API_KEY=<the secret from step 0>
   SPEED_UNIT=knots
   ```
2. Register the fake device: web app → **Trackers → Register Device** — IMEI `1234567890`, assign a vehicle, status Active.
3. Terminal 1: `pnpm --filter @mms/gps-gateway dev` → wait for `listening on tcp/5013`.
4. Terminal 2: `pnpm --filter @mms/gps-gateway simulate 1234567890`.

**✓ Verify:** gateway logs show forwarded positions; the assigned vehicle moves on the deployed map within ~10 s.

> Registered the device *after* starting the gateway? Restart the gateway — it caches "unknown device" answers for 5 minutes.

---

## Tier 3 — Real ST-901 hardware

The tracker dials a public IP over TCP, so the gateway moves to a Google Cloud e2-micro VM. **The ST-901 is 2G-only** — confirm 2G coverage with your telco first (ST-901L is the 4G variant).

**What this costs.** The `e2-micro` is Always Free (forever, no trial needed) *provided* it runs in `us-west1`, `us-central1` or `us-east1` on a **standard** persistent disk of 30 GB or less. Pick any other region, or the default *balanced* disk, and you are billed. The one thing Always Free does **not** cover is the external IPv4 address the tracker has to dial: since Feb 2024 that is **$0.005/hour ≈ $3.65/month**. The $300 / 90-day signup credit swallows it (~$11 over the whole trial), so budget the decision for the 90-day mark, not for now.

US-region latency is irrelevant here — the device sends a small packet every 10–30 s.

### 3.1 Provision the VM

Everything below runs in **Cloud Shell** (the `>_` icon in the console header). Nothing to install locally.

1. Sign up at console.cloud.google.com, activate the free trial, and create a project.
2. Set a budget alert first: Billing → Budgets & alerts → ₱500, alert at 50/90/100%. Cheap insurance against a mis-clicked region.
3. Paste the block below, changing `PROJECT` to your project ID.

```bash
PROJECT=your-project-id
REGION=us-central1
ZONE=us-central1-a

gcloud config set project $PROJECT
gcloud services enable compute.googleapis.com

# Reserve the IP BEFORE the VM. A default GCP external IP is ephemeral and
# changes whenever the VM stops — and this address gets burned into every
# tracker by SMS in 3.5, so it must not move.
gcloud compute addresses create mms-gps-ip --region=$REGION

# The exact Always-Free shape: e2-micro, US region, 30 GB *standard* disk.
gcloud compute instances create mms-gps-gateway \
  --zone=$ZONE \
  --machine-type=e2-micro \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-type=pd-standard \
  --boot-disk-size=30GB \
  --address=mms-gps-ip \
  --tags=mms-gps

gcloud compute instances describe mms-gps-gateway --zone=$ZONE \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
```

The last command prints `VM_IP`, used everywhere below.

### 3.2 Open TCP 5013 — one firewall, not two

```bash
gcloud compute firewall-rules create allow-mms-gps-5013 \
  --allow=tcp:5013 \
  --target-tags=mms-gps \
  --source-ranges=0.0.0.0/0
```

Scoped to the `mms-gps` tag, so it opens the port on this VM only. Unlike Oracle, GCP's Ubuntu images ship with no host firewall — there is no `iptables` step, and adding one is the usual way people break this.

SSH in with `gcloud compute ssh mms-gps-gateway --zone=$ZONE`. **Your login is your Google username, not `ubuntu`** — the systemd unit in 3.3 accounts for that.

### 3.3 Install the gateway

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
MMS_API_URL=https://YOUR-API.onrender.com
GPS_DEVICE_API_KEY=THE-SECRET-FROM-STEP-0
SPEED_UNIT=knots
EOF
```

Run it under systemd:

Note the **unquoted** `EOF` — `$USER` and `$HOME` must expand, because on GCP your login is your Google username rather than `ubuntu`. Hardcoding `ubuntu` here yields a unit that fails at start with a confusing permissions error.

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
```

**✓ Verify:** `journalctl -u mms-gps-gateway -f` shows `GPS gateway listening on tcp/5013`.

### 3.4 Smoke test from your laptop

```bash
pnpm --filter @mms/gps-gateway simulate 1234567890 VM_IP 5013
```

**✓ Verify:** vehicle moves on the deployed map (device from Tier 2 still registered). This proves ports, key, API, and map — only the physical tracker remains.

### 3.5 Configure the tracker by SMS

Insert the SIM (has load + data, tested in a phone), power the device on 12 V. Default password `0000`; each accepted command replies **SET OK**.

| Purpose | SMS | Notes |
|---|---|---|
| APN | `8030000 <apn>` | from your telco; with credentials: `8030000 <apn> <user> <pass>` |
| Server | `8040000 VM_IP 5013` | space-separated |
| Interval, ignition ON | `8050000 20` | seconds — default fine |
| Interval, ignition OFF | `8090000 300` | seconds — default fine |

Take the tracker outdoors; first GPS fix can take minutes.

### 3.6 Register the real device

H02 trackers often send a device ID that is **not** the full IMEI — read it, don't guess:

1. `journalctl -u mms-gps-gateway -f` → the "unregistered/unassigned" warning contains the exact ID the device sends.
2. Register that ID: **Trackers → Register Device**, assign the vehicle, Active. (One active device per vehicle — deactivate the Tier-2 fake on that vehicle first.)
3. `sudo systemctl restart mms-gps-gateway` (clears the 5-min cache).

**✓ Verify:** frames from the device's ID in the logs; marker live on the map; Trackers page shows Online.

---

## Troubleshooting (all tiers)

| Tier | Symptom | Fix |
|---|---|---|
| 1 | Start Demo does nothing / console 401s | `VITE_GPS_DEVICE_KEY` wrong or FE not redeployed after setting it |
| any | Ingest returns 500 `GPS_NOT_CONFIGURED` | `GPS_DEVICE_API_KEY` not set on Render |
| 2–3 | Gateway logs "unregistered/unassigned" | Register the exact logged ID, then restart the gateway (5-min cache) |
| 2–3 | Forwarder errors / retries | Wrong `MMS_API_URL` or key; or Render asleep — gateway retries 3× then drops the point, next frames land once awake. Wake the API before demos |
| 3 | No SMS reply from tracker | SIM lacks load/SMS or device unpowered — test SIM in a phone |
| 3 | SET OK but nothing reaches the VM | Wrong APN, no data plan, or no 2G coverage; re-test port with the simulator from a phone hotspot |
| 3 | `systemd` unit fails instantly on GCP | The unit was written with a quoted heredoc, so `User=` is the literal `$USER`. Rewrite it with unquoted `EOF` (3.3) — your GCP login is not `ubuntu` |
| 3 | Trackers stopped reporting after a VM restart | The VM took an ephemeral IP instead of the reserved one. Confirm with `gcloud compute addresses list`; if it says `RESERVED` rather than `IN_USE`, attach it and re-send the `8040000` SMS to every device |
| 3 | Unexpected GCP charges | Wrong region (must be `us-west1`/`us-central1`/`us-east1`) or a *balanced* boot disk instead of `pd-standard`. The ~$3.65/month external-IP charge is expected and is not covered by Always Free |
| 3 | `dropping void fix` forever | No GPS lock — outdoors, wait minutes |
| 3 | Speeds ~2× off | Flip `SPEED_UNIT` between `knots` and `kmh`, restart |
| 3 | Online dot flaps while device reports | Known quirk: last-seen refreshes only on cache misses (≤5-min lag). Trust the map |

## Ops

- Logs: `journalctl -u mms-gps-gateway -f`
- Update: `cd ~/motorpool-management-system-web && git pull && pnpm install --frozen-lockfile && pnpm --filter @mms/gps-gateway build && sudo systemctl restart mms-gps-gateway`
- Costs: everything free except SIM data (a few MB/day per tracker).
