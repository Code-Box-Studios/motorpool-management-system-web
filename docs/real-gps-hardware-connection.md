# Connect a Real GPS Tracker to MMS

This guide connects a **SinoTrack ST-901-compatible tracker that speaks the H02 TCP protocol** to the live MMS map. It is an operations guide: it does not require an MMS code change.

> **Before you buy or install anything:** the MMS gateway currently decodes H02 frames from the ST-901 family. A tracker from another manufacturer cannot be pointed at MMS directly; its protocol must first be supported by the gateway. The ST-901 is normally 2G-only, so confirm that your carrier still provides 2G data coverage at the vehicles' operating locations. An ST-901L/4G model also needs its protocol checked before rollout.

## What you need

- An MMS deployment with a reachable HTTPS API URL, such as `https://mms-api.example.com`.
- An MMS **Admin** account, so you can register a tracker and assign it to a vehicle.
- A GCP account/project with billing enabled. The gateway needs a public, **reserved static IPv4** address.
- An activated SIM for the tracker with SMS, mobile data, and compatible 2G service.
- The tracker, its wiring/power supply, and a phone that can send SMS to the SIM.
- A computer with the MMS repository, Node 20+, and pnpm for the simulator check.

## How the connection works

```text
ST-901 tracker --mobile data / raw TCP--> public gateway on TCP 5013
gateway --HTTPS + secret--> MMS API --stored GPS point--> MMS dashboard map
```

The tracker does **not** call the MMS API itself. It sends H02 TCP messages to the gateway. The gateway translates them, looks up the registered tracker ID, and securely forwards positions to MMS.

## Values to collect before starting

Keep these values private and replace the placeholders in the commands below.

| Placeholder    | Meaning                                         | Example                       |
| -------------- | ----------------------------------------------- | ----------------------------- |
| `<API_URL>`    | HTTPS base URL of the deployed MMS API          | `https://mms-api.example.com` |
| `<PROJECT_ID>` | Google Cloud project ID                         | `mms-production-123`          |
| `<VM_IP>`      | Reserved static IPv4 assigned to the gateway VM | `34.72.10.20`                 |
| `<SECRET>`     | New device API key generated in step 1          | Never publish this            |
| `<APN>`        | Mobile carrier APN for the tracker SIM          | Ask the carrier               |
| `<VEHICLE>`    | MMS vehicle to show on the map                  | Plate / fleet number          |

## 1. Create the private device key

On a trusted computer, generate a key:

```bash
openssl rand -hex 24
```

Save the output as `<SECRET>` in a password manager. In the Render dashboard for the **MMS API service**, add this environment variable and let the service redeploy:

```text
GPS_DEVICE_API_KEY=<SECRET>
```

Verify the API is configured without revealing the real key:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST <API_URL>/api/gps/ingest \
  -H "x-device-api-key: wrong"
```

Expected result: `401`. A `500` means the API deployment does not yet have `GPS_DEVICE_API_KEY`.

**Security note:** for real hardware, put this secret only in the API service and the gateway VM. Do not expose it in a `VITE_*` browser variable. The browser demo is a separate development feature and is not needed for tracker hardware.

## 2. Create a gateway VM with a permanent IP address

In Google Cloud Console, first create a modest billing budget/alert. Then open **Cloud Shell** and run this, replacing `<PROJECT_ID>`:

```bash
PROJECT=<PROJECT_ID>
REGION=us-central1
ZONE=us-central1-a

gcloud config set project $PROJECT
gcloud services enable compute.googleapis.com

# Do this before making the VM. This is the IP burned into the tracker by SMS.
gcloud compute addresses create mms-gps-ip --region=$REGION

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

Record the final IPv4 output as `<VM_IP>`. Confirm it is the reserved address:

```bash
gcloud compute addresses list
```

`mms-gps-ip` must show `IN_USE`. Do not use an ephemeral IP: it can change after a VM stop/start and every tracker would need to be reconfigured.

## 3. Install and start the MMS gateway

Connect to the VM:

```bash
gcloud compute ssh mms-gps-gateway --zone=us-central1-a
```

On the VM, install the gateway and configure it. Replace `<API_URL>` and `<SECRET>` before pasting:

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
MMS_API_URL=<API_URL>
GPS_DEVICE_API_KEY=<SECRET>
SPEED_UNIT=knots
EOF
```

Create the service. Keep the `EOF` below **unquoted** so the VM expands `$USER` and `$HOME`:

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

Expected log line:

```text
GPS gateway listening on tcp/5013
```

## 4. Prove the complete pipeline before touching the tracker

This avoids debugging the SIM, tracker, cloud firewall, and MMS all at once.

1. Sign in to MMS as an Admin.
2. Open **Trackers** → **Register Device**.
3. Register IMEI `1234567890`, assign `<VEHICLE>`, and set status to **Active**.
4. On the VM, restart the gateway to clear its five-minute registry cache:

   ```bash
   sudo systemctl restart mms-gps-gateway
   ```

5. From your computer in the MMS repo, run:

   ```bash
   pnpm --filter @mms/gps-gateway simulate 1234567890 <VM_IP> 5013
   ```

6. Watch the VM log with `journalctl -u mms-gps-gateway -f` and the deployed MMS dashboard. Within about 10 seconds, `<VEHICLE>` should move on the map.
7. Stop the simulator with `Ctrl+C`, then change the fake device's status to **Inactive** in **Trackers**. MMS allows only one active tracker per vehicle.

If the simulator works, the internet firewall, gateway, API URL, secret, registration, and map are all correct.

## 5. Prepare and configure the physical tracker

1. Test the SIM in a phone: it must receive SMS and have a working mobile-data plan.
2. Insert the SIM into the tracker and power it according to its hardware manual. For installation, use an automotive technician and the tracker vendor's wiring instructions; this guide covers the network connection, not vehicle electrical safety.
3. Send these SMS messages to the SIM number. The commands below are for the ST-901 firmware supported by this MMS gateway. Default password is normally `0000`; each accepted command should reply `SET OK`.

| Purpose                                  | SMS command                           |
| ---------------------------------------- | ------------------------------------- |
| Set carrier APN                          | `8030000 <APN>`                       |
| Set APN with carrier credentials         | `8030000 <APN> <APN_USER> <APN_PASS>` |
| Set MMS gateway server                   | `8040000 <VM_IP> 5013`                |
| Report every 20 seconds with ignition on | `8050000 20`                          |
| Report every 5 minutes with ignition off | `8090000 300`                         |

4. Take the tracker outdoors. The first GPS fix can take several minutes.
5. On the VM, start watching the log:

   ```bash
   journalctl -u mms-gps-gateway -f
   ```

At this stage an `unregistered/unassigned device ...` message is expected. Copy the device ID from that exact log line. Do **not** assume it is the IMEI printed on the tracker; H02 devices often report a different identifier.

## 6. Register the real tracker and confirm it is live

1. In MMS as an Admin, go to **Trackers** → **Register Device**.
2. Enter the exact device ID copied from the gateway log, assign `<VEHICLE>`, and set status to **Active**.
3. Restart the gateway so it forgets the earlier “unknown device” result:

   ```bash
   sudo systemctl restart mms-gps-gateway
   ```

4. Confirm all three outcomes:
   - The VM log shows frames being forwarded, with no `unregistered` or `forward failed` messages.
   - The MMS dashboard map shows `<VEHICLE>` at the real tracker location and updates while it moves.
   - The **Trackers** page shows the device as **Online**. This indicator can lag by up to five minutes; the map is the better live signal.

5. Carry or drive the tracker and compare its speed with the dashboard. If the displayed speed is approximately twice the actual speed, change `SPEED_UNIT` in `apps/gps-gateway/.env` from `knots` to `kmh` (or the reverse), then restart:

   ```bash
   sudo systemctl restart mms-gps-gateway
   ```

## Troubleshooting

| What you see                               | Likely cause                                                                     | What to do                                                                                        |
| ------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| API check returns `500 GPS_NOT_CONFIGURED` | API key missing from the deployed API                                            | Set `GPS_DEVICE_API_KEY` in the API service and wait for its deploy to finish.                    |
| Gateway will not start                     | Missing/malformed `.env`, incorrect Node installation, or key absent             | Run `journalctl -u mms-gps-gateway -n 50 --no-pager`; check the four required `.env` values.      |
| Simulator cannot move the map              | Firewall, secret, API URL, or tracker registration issue                         | Fix this before configuring hardware; follow step 4 from the top.                                 |
| `unregistered/unassigned`                  | Logged ID is not active/assigned in MMS, or the old 404 is cached                | Register the exact logged ID, assign a vehicle, activate it, restart gateway.                     |
| `dropping void fix`                        | The tracker lacks a GPS satellite fix                                            | Move outdoors with clear sky and wait several minutes.                                            |
| `SET OK` but no VM logs after 10 minutes   | Incorrect APN, no data plan, incompatible/absent 2G coverage, or wrong server IP | Recheck APN and SIM in a phone; confirm `<VM_IP>:5013` with the simulator.                        |
| No SMS reply                               | Tracker unpowered or SIM cannot receive SMS                                      | Check power, SMS credit, and SIM in a phone.                                                      |
| Map works but online status flickers       | Registry last-seen refresh can lag                                               | Trust recent map updates; status can lag up to five minutes.                                      |
| Tracker stops after VM restart             | Static address is no longer attached                                             | Check `gcloud compute addresses list`; reattach the reserved IP before re-sending the server SMS. |

## Day-to-day operations

Follow gateway logs:

```bash
journalctl -u mms-gps-gateway -f
```

After updating the gateway repository on the VM:

```bash
cd ~/motorpool-management-system-web
git pull
pnpm install --frozen-lockfile
pnpm --filter @mms/gps-gateway build
sudo systemctl restart mms-gps-gateway
```

The gateway depends on a stable public IP, the tracker SIM/data plan, and API key parity between the API and VM. Change any of those deliberately, one at a time, and repeat the simulator check before changing the hardware configuration.
