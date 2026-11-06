# GPS Deployment Runbook

Deploy real trackers through the gateway. The simulator is an optional development tool for an isolated test API/database.

| Workflow                  | What it proves                                | Needs                             | Time        |
| ------------------------- | --------------------------------------------- | --------------------------------- | ----------- |
| **Development simulator** | Gateway → API path in an isolated environment | Laptop + repo + test API/database | ~15 min     |
| **Real hardware**         | Live compatible trackers in vehicles          | Google Cloud VM + tracker + SIM   | ~half a day |

```mermaid
flowchart LR
  T["ST-901 tracker"] -->|"TCP H02 :5013"| G["Gateway"]
  G -->|"POST /api/gps/ingest + device key"| A["API (Render)"]
  A --> M["Dashboard map (polls 5 s)"]
```

Positions flow into `/api/gps/ingest` authenticated by a shared device key; the map polls the latest point per vehicle every 5 seconds. The browser reads GPS data only. There are no in-app demo controls or generated GPS seed points.

---

## 0. Once-only setup

1. Generate a secret: `openssl rand -hex 24`
2. **Render** → API service → Environment → `GPS_DEVICE_API_KEY=<secret>` → save.
3. Put the same private `GPS_DEVICE_API_KEY` in the gateway environment. The web app needs only its API URL.

**✓ Verify:** `curl -X POST https://YOUR-API.onrender.com/api/gps/ingest -H "x-device-api-key: wrong"` returns 401 (not 500 — a 500 means the key isn't set).

---

## Development — Simulator through the gateway

Run the gateway on your laptop against a development API/database. Simulated points are stored like real readings, so use a dedicated test vehicle and keep this workflow separate from production tracking.

1. Create `apps/gps-gateway/.env`:
   ```ini
   GATEWAY_TCP_PORT=5013
   MMS_API_URL=http://localhost:3001
   GPS_DEVICE_API_KEY=<the secret from step 0>
   SPEED_UNIT=knots
   ```
2. Register the fake device: web app → **Trackers → Register Device** — IMEI `1234567890`, assign a vehicle, status Active.
3. Terminal 1: `pnpm --filter @mms/gps-gateway dev` → wait for `listening on tcp/5013`.
4. Terminal 2: `pnpm --filter @mms/gps-gateway simulate 1234567890`.

**✓ Verify:** the assigned test vehicle moves on the development map within ~10 s.

> Registered the device _after_ starting the gateway? Restart the gateway — it caches "unknown device" answers for 5 minutes.

---

## 3. Real ST-901 hardware

The tracker dials a public IP over TCP, so the gateway moves to a Google Cloud e2-micro VM. **The ST-901 is 2G-only** — confirm 2G coverage with your telco first (ST-901L is the 4G variant).

**What this costs.** The `e2-micro` is Always Free (forever, no trial needed) _provided_ it runs in `us-west1`, `us-central1` or `us-east1` on a **standard** persistent disk of 30 GB or less. Pick any other region, or the default _balanced_ disk, and you are billed. The one thing Always Free does **not** cover is the external IPv4 address the tracker has to dial: since Feb 2024 that is **$0.005/hour ≈ $3.65/month**. The $300 / 90-day signup credit swallows it (~$11 over the whole trial), so budget the decision for the 90-day mark, not for now.

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
pnpm --filter @mms/gps-gateway... build

cat > apps/gps-gateway/.env <<'EOF'
GATEWAY_TCP_PORT=5013
MMS_API_URL=https://YOUR-API.onrender.com
GPS_DEVICE_API_KEY=THE-SECRET-FROM-STEP-0
SPEED_UNIT=knots
PACKET_LOG_DIR=/var/lib/mms-gps-gateway
PACKET_LOG_MAX_BYTES=268435456
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
StateDirectory=mms-gps-gateway
Environment=PACKET_LOG_DIR=/var/lib/mms-gps-gateway
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now mms-gps-gateway
```

**✓ Verify:** `journalctl -u mms-gps-gateway -f` shows `GPS gateway listening on tcp/5013`.

Apply the API packet-log migration and deploy API/frontend before updating the gateway.
The dependency-inclusive build above generates `@mms/shared/dist` as well as the
gateway. This service runs inside the built workspace; do not copy its `dist` folder
alone. For a portable release, follow the gateway README and preserve the packaged
`node_modules`. Configure `.env` separately; local environment files are excluded
from the release.

`StateDirectory` creates a persistent spool owned by the service user. Monitor
`journalctl` for capacity/write or upload errors; the spool is bounded at 256 MiB
and must survive source updates. Administrators can inspect received packets under
**Tracker Devices → Tracker Logs**, including unregistered devices and invalid
fixes. Logging starts only after this gateway version is running. Historical
rejected traffic cannot be reconstructed. A disk failure is explicitly reported
and cannot guarantee capture; no database retention deletion is enabled.

### 3.4 Smoke test from your laptop

```bash
pnpm --filter @mms/gps-gateway simulate 1234567890 VM_IP 5013
```

**✓ Verify:** vehicle moves on the deployed map (device from Tier 2 still registered). This proves ports, key, API, and map — only the physical tracker remains.

### 3.5 Configure the tracker by SMS

Insert the SIM (has load + data, tested in a phone), power the device on 12 V. Default password `0000`; each accepted command replies **SET OK**.

| Purpose                | SMS                  | Notes                                                            |
| ---------------------- | -------------------- | ---------------------------------------------------------------- |
| APN                    | `8030000 <apn>`      | from your telco; with credentials: `8030000 <apn> <user> <pass>` |
| Server                 | `8040000 VM_IP 5013` | space-separated                                                  |
| Interval, ignition ON  | `8050000 20`         | seconds — default fine                                           |
| Interval, ignition OFF | `8090000 300`        | seconds — default fine                                           |

Take the tracker outdoors; first GPS fix can take minutes.

### 3.6 Register the real device

H02 trackers often send a device ID that is **not** the full IMEI — read it, don't guess:

1. `journalctl -u mms-gps-gateway -f` → the "unregistered/unassigned" warning contains the exact ID the device sends.
2. Register that ID: **Trackers → Register Device**, assign the vehicle, Active. Only one active device may be assigned to a vehicle.
3. `sudo systemctl restart mms-gps-gateway` (clears the 5-min cache).

**✓ Verify:** frames from the device's ID in the logs; marker live on the map; Trackers page shows Online.

---

## Troubleshooting

| Workflow | Symptom                                       | Fix                                                                                                                                                                                                        |
| -------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| any      | Ingest returns 500 `GPS_NOT_CONFIGURED`       | `GPS_DEVICE_API_KEY` not set on Render                                                                                                                                                                     |
| any      | Gateway logs "unregistered/unassigned"        | Register the exact logged ID, then restart the gateway (5-min cache)                                                                                                                                       |
| any      | Forwarder errors / retries                    | Check `MMS_API_URL`, the private gateway/API key, and API availability                                                                                                                                     |
| 3        | No SMS reply from tracker                     | SIM lacks load/SMS or device unpowered — test SIM in a phone                                                                                                                                               |
| 3        | SET OK but nothing reaches the VM             | Wrong APN, no data plan, or no 2G coverage; re-test port with the simulator from a phone hotspot                                                                                                           |
| 3        | `systemd` unit fails instantly on GCP         | The unit was written with a quoted heredoc, so `User=` is the literal `$USER`. Rewrite it with unquoted `EOF` (3.3) — your GCP login is not `ubuntu`                                                       |
| 3        | Trackers stopped reporting after a VM restart | The VM took an ephemeral IP instead of the reserved one. Confirm with `gcloud compute addresses list`; if it says `RESERVED` rather than `IN_USE`, attach it and re-send the `8040000` SMS to every device |
| 3        | Unexpected GCP charges                        | Wrong region (must be `us-west1`/`us-central1`/`us-east1`) or a _balanced_ boot disk instead of `pd-standard`. The ~$3.65/month external-IP charge is expected and is not covered by Always Free           |
| 3        | `dropping void fix` forever                   | No GPS lock — outdoors, wait minutes                                                                                                                                                                       |
| 3        | Speeds ~2× off                                | Flip `SPEED_UNIT` between `knots` and `kmh`, restart                                                                                                                                                       |
| 3        | Online dot flaps while device reports         | Known quirk: last-seen refreshes only on cache misses (≤5-min lag). Trust the map                                                                                                                          |

## Ops

- Logs: `journalctl -u mms-gps-gateway -f`
- Update the existing gateway only after the matching API release is live. The updater builds a separate release, preserves the existing `.env` and source edits, installs persistent spool settings, and restores the previous service configuration if startup fails. It does not send simulated tracker traffic. Run this in Cloud Shell, replacing the SHA with the full verified release commit:

  ```bash
  MMS_RELEASE_SHA=<full-40-character-commit-SHA>
  gcloud compute ssh mms-gps-gateway \
    --project=um-mms-gps \
    --zone=us-central1-a \
    --command="bash -o pipefail -c 'curl -fsSL https://raw.githubusercontent.com/Code-Box-Studios/motorpool-management-system-web/$MMS_RELEASE_SHA/apps/gps-gateway/deploy/update-existing.sh | bash -s -- $MMS_RELEASE_SHA'"
  ```

  The SSH user must be able to read the current gateway `.env` and use `sudo`. The script expects an active `mms-gps-gateway` service and Node 20 or later. A successful command confirms the service and listener; also verify that a new real tracker packet appears in MMS **Packet Logs**. Previous rejected traffic is unavailable. Closing Cloud Shell leaves the systemd service running.
- Costs: everything free except SIM data (a few MB/day per tracker).
