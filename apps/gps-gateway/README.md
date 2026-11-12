# MMS GPS Gateway (SinoTrack ST-901 / ST-901L-X / H02)

A standalone TCP service that receives H02 frames from SinoTrack ST-901 trackers,
resolves each reported device ID to a vehicle, and forwards positions to the MMS API's
`POST /api/gps/ingest`. It never touches the database.

Position requests include the H02 `deviceId`, `protocol: 'h02'`, and receipt.
The API locks the registered tracker row and resolves its current active vehicle
assignment before writing. The gateway's cached vehicle ID is only a hint:
reassignment takes effect at ingest, and inactive/unassigned devices cannot add
positions. The GPS point and final saved packet attribution commit together;
their shared receipt UUID also deduplicates an ingest retry after a lost response.
The API returns the authoritative vehicle ID for the gateway's final log.

Deploy the updated API before restarting this gateway. The identity-free,
device-key-authenticated ingest contract remains for trusted direct integrations;
older gateways use that legacy contract and must be upgraded for these assignment
checks. Historical saved points/receipts keep their original assignment when a
tracker is subsequently moved or deactivated.

## Packet logs in MMS

Administrators can open **Tracker Devices → Packet Logs**, or **View packet logs**
on an individual tracker. The viewer shows receipt time, transmitted tracker ID,
raw text/hex, decoded coordinates, and processing outcome. Unknown/unassigned
devices, heartbeats, invalid fixes, binary fragments, incomplete messages, and
socket/lookup/forwarding failures remain visible. Invalid fixes never update the
vehicle position. Traffic without a reliable ID appears in the global view.

Capture starts with this gateway version; older rejected traffic cannot be
reconstructed. Apply API migrations and deploy the API/frontend before the gateway.
Only a successful position ingest is labeled **Position saved**.

Each receipt and outcome first enters an atomic, fsynced disk spool, then uploads
to `POST /api/gps/packet-logs` with the existing device key. Pending uploads replay
after outages/restarts using their original IDs. Log replay does not re-ingest
positions. A crash before processing finishes can leave a receipt pending.

Set `PACKET_LOG_DIR` to a persistent directory writable by the gateway service
user. The provided systemd unit creates `/var/lib/mms-gps-gateway` using
`StateDirectory`; set `PACKET_LOG_DIR=/var/lib/mms-gps-gateway` in the deployed
environment too if the environment file overrides it. Do not run multiple gateway
processes against the same spool. Local development defaults to `.packet-log-spool`.
Pending spool files contain tracker/location data and use owner-only permissions.

`PACKET_LOG_MAX_BYTES` defaults to 256 MiB. Disk-capacity/write failures are explicit
service-journal errors; traffic received during disk failure cannot be guaranteed
captured, while vehicle forwarding continues. Monitor free disk and upload errors.
No automatic deletion policy is applied to database logs. A corrupt spool file is
retained for operator recovery; a damaged temporary write fails startup rather
than silently dropping the event. Inspect it before removing or repairing it.
`API_TIMEOUT_MS` defaults to 5000; upload retry backoff is capped at 30 seconds.
Messages over 8192 bytes are stored as bounded diagnostic fragments, not positions.

    Tracker --mobile data/TCP--> gateway --HTTPS--> MMS API --> Postgres --> dashboard

## Why a gateway?

Compatible ST-901-family trackers open a raw TCP socket to a server configured by
SMS and stream H02 messages. The gateway translates those messages into HTTPS API
requests. Radio support depends on the model: ST-901L-X is a 4G variant. Register
the exact device ID observed in gateway logs rather than assuming the printed IMEI.

## Configuration

Copy `.env.example` to `.env`. Every variable is documented there. The two that matter:

- `MMS_API_URL` — where the MMS API lives.
- `GPS_DEVICE_API_KEY` — must equal the API's `GPS_DEVICE_API_KEY`. **The gateway refuses to start without it.**

`SPEED_UNIT` (`knots` by default) exists because H02 speed units are firmware-dependent —
confirm it against your device (see Capturing below) before trusting the dashboard's km/h.

## Running

    pnpm --filter @mms/shared build          # required on a fresh checkout
    pnpm --filter @mms/gps-gateway dev        # watch mode
    pnpm --filter @mms/gps-gateway... build
    pnpm --filter @mms/gps-gateway start

Test the pipeline against an isolated development API/database:

    pnpm --filter @mms/gps-gateway simulate <imei>

(Register that IMEI in the development Trackers screen and assign a test vehicle first, or
the gateway will correctly drop the frames as unregistered.)

## Capturing real device frames

ST-901 firmware revisions differ in message types, field counts, and speed units.
The decoder supports `V1`, `V5`, `V6`, and `V8` position reports and `V0`, `HTBT`, and
`H1` heartbeats. ST-901L-X firmware uses `V6`/`V8` positions with extra telemetry
after the status word; the common position fields are decoded and the extra fields
are ignored.
Before trusting the decoder against a new device, capture what it actually sends:

    pnpm --filter @mms/gps-gateway capture

Point the tracker at that port, let it report for a few minutes, and inspect
`captures/*.log` (hex + ascii). Add real frames to `src/h02.test.ts` as fixtures.

## Deploying (Google Cloud `e2-micro`)

Full runbook with copy-paste commands: [`docs/gps-deployment.md`](../../docs/gps-deployment.md) §3.

For an existing running `mms-gps-gateway` service, use the pinned-commit update
command in that runbook's **Ops** section. The updater preserves the current
configuration and source checkout, builds a separate portable release, forces a
persistent spool path, and restores the previous service configuration if startup
fails. Deploy the API migration first, then verify a new real packet in MMS.

1. Install Node 22, clone the repo, run `pnpm install --frozen-lockfile`, then
   `pnpm --filter @mms/gps-gateway... build` to build the shared runtime dependency too.
2. Run directly from the built workspace as in the linked runbook. For the provided
   `/opt/mms/gps-gateway` unit, first create a portable release from the repository root:
   `node --max-old-space-size=64 apps/gps-gateway/deploy/package-runtime.mjs <new-runtime-directory>`.
   The destination must not exist yet. The packager copies the installed, lockfile-selected
   production packages without resolving the rest of the workspace or accessing the registry.
   Copy the entire release, including `node_modules`, to `/opt/mms/gps-gateway` and
   configure its `.env` separately. Copying only `dist` misses runtime dependencies.
   Local `.env` files and development dependencies are excluded from the release.
3. Install the unit: `cp deploy/gps-gateway.service /etc/systemd/system/` then
   `systemctl enable --now gps-gateway`.
4. Open the TCP port with a VPC firewall rule scoped to the instance's network tag
   (`gcloud compute firewall-rules create ... --target-tags=...`). GCP's Ubuntu images
   ship with no host firewall, so there is no `ufw`/`iptables` step — adding one is the
   usual way this gets broken.
5. `journalctl -u gps-gateway -f` to watch it.

Two things that cost real time if missed: the VM needs a **reserved static external IP**
(the default is ephemeral and moves on restart, and this address is burned into every
tracker by SMS), and the always-free shape is `e2-micro` + a **standard** 30 GB disk in
`us-west1`/`us-central1`/`us-east1` only. The external IPv4 itself is not free —
~$3.65/month.

## Provisioning an ST-901 (SMS cheat-sheet)

Insert an activated SIM with SMS and data service compatible with the tracker,
power the device, then send these SMS messages to the SIM
(default password is `0000` on most units — check your device's manual, commands vary
by firmware):

| Purpose                         | SMS                                |
| ------------------------------- | ---------------------------------- |
| Read configuration / device ID  | `RCONF`                            |
| Set the APN                     | `8030000 <apn>`                    |
| Point it at the gateway         | `8040000 <gateway-public-ip> 5013` |
| Ignition-on reporting interval  | `8050000 30`                       |
| Ignition-off reporting interval | `8090000 180`                      |

Then register the reported **device ID** in the MMS Trackers admin screen and assign it to a
vehicle. Confirm with `journalctl -u gps-gateway -f` that frames arrive and forward.

> ⚠️ **2G is being switched off in many countries.** Confirm your carrier still runs a
> 2G network before buying more of these devices.
