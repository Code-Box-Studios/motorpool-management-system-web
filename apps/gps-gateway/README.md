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

## Deploying (Google Cloud `e2-micro`)

Full runbook with copy-paste commands: [`docs/gps-deployment.md`](../../docs/gps-deployment.md) §3.

1. Install Node 20, clone the repo, `pnpm install`, `pnpm --filter @mms/gps-gateway build`.
2. Copy the build to `/opt/mms/gps-gateway` and create `/opt/mms/gps-gateway/.env`.
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
