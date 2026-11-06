# Add a SinoTrack ST-901L-X to a Vehicle and MMS

Use this procedure when adding another ST-901L-X 4G tracker to the existing MMS installation. Reuse the existing gateway; each new tracker gets its own device record and vehicle assignment in MMS.

## Existing MMS connection

These deployment values were verified on 6 November 2026. Check the VM's current public IP before configuring a new batch of trackers.

| Item | Value |
| --- | --- |
| MMS app | https://um-mms-web.vercel.app |
| GPS server | `104.198.172.49` |
| GPS TCP port | `5013` |
| Google Cloud project | `um-mms-gps` |
| Gateway VM | `mms-gps-gateway` |
| VM zone | `us-central1-a` |
| Gateway service | `mms-gps-gateway` |

The tracker sends positions through its SIM to the gateway. The gateway forwards them to the MMS API, which stores them for the app. The browser does not send GPS readings or hold the private gateway key.

## 1 Prepare the tracker and SIM

You need the tracker and its wiring diagram, an active SIM with SMS and mobile data, the SIM's phone number and carrier APN, a phone for sending SMS, and an MMS Admin account.

Test the SIM in a phone first. Confirm that SMS and mobile data work and disable its SIM PIN. Use the SIM size specified for the unit. Record which SIM belongs to which vehicle.

The SMS examples below use the factory password `0000`. If the password has changed, substitute the current password in each command.

## 2 Install the tracker in the car

Have an automotive electrician connect it using the diagram supplied with the exact unit. Confirm its voltage range and fit the specified fuse. Do not identify vehicle ignition wires by color alone.

For the ST-901L four-wire harness, the manual shows these functions:

| Tracker wire | Function |
| --- | --- |
| Red | Fused vehicle battery positive |
| Black | Vehicle ground or battery negative |
| Orange | ACC or ignition sensing |
| Yellow | Optional relay control; not required for location tracking |

Verify those functions against the unit's diagram before connecting anything. Insulate unused leads. Relay installation and engine immobilization are separate from GPS setup and are not required by MMS.

Mount the tracker securely with its GPS antenna side facing the sky, away from metal shielding, heat, and moving parts. Glass or plastic covering is suitable. Keep the unit powered while testing outdoors.

ACC wiring matters for ignition information. A powered tracker does not by itself mean the car's ignition is on.

## 3 Confirm the existing gateway is running

Open Google Cloud Shell and run:

```bash
gcloud compute instances describe mms-gps-gateway \
  --project=um-mms-gps \
  --zone=us-central1-a \
  --format="table(name,status,networkInterfaces[0].accessConfigs[0].natIP)"
```

Expect `RUNNING` and the public IP above. If it is stopped, start the existing VM:

```bash
gcloud compute instances start mms-gps-gateway \
  --project=um-mms-gps \
  --zone=us-central1-a
```

Check its background service:

```bash
gcloud compute ssh mms-gps-gateway \
  --project=um-mms-gps \
  --zone=us-central1-a \
  --command="sudo systemctl status mms-gps-gateway --no-pager"
```

Expect `active (running)` and `GPS gateway listening on tcp/5013`. If Google reports billing is disabled, restore billing for this project before continuing. If the public IP differs, verify the reserved gateway address before changing any tracker settings.

## 4 Configure the new tracker by SMS

Send each command from your phone's Messages app to the SIM number inside the tracker. Replace `<APN>` with the SIM provider's APN; `internet` is the APN used by the currently working unit.

Send commands one at a time and wait for the reply:

| Purpose | SMS |
| --- | --- |
| Set the carrier APN | `8030000 <APN>` |
| Enable online reporting | `7100000` |
| Use the MMS gateway | `8040000 104.198.172.49 5013` |
| Ignition-on interval, 30 seconds | `8050000 30` |
| Ignition-off interval, 180 seconds | `8090000 180` |
| Use UTC for tracker timestamps | `8960000E00` |

Accepted setting commands should reply `SET OK`. Then send:

```text
RCONF
```

Check these fields in the fresh reply:

```text
MODE:GPRS
APN:<your carrier APN>
IP:104.198.172.49,5013
GPRS UPLOAD TIME:30,180
TIME ZONE:E00
```

`SET OK` confirms acceptance of a command. `RCONF` confirms stored settings. Neither alone proves that a position reached MMS.

## 5 Obtain a GPS fix and confirm incoming traffic

Keep the tracker outdoors and powered. In this model's manual, solid blue indicates a GPS fix; blinking blue indicates acquisition or no fix. The orange indicator concerns the cellular module. LED state alone does not confirm an MMS upload.

Watch gateway traffic from Cloud Shell:

```bash
gcloud compute ssh mms-gps-gateway \
  --project=um-mms-gps \
  --zone=us-central1-a \
  --command="sudo journalctl -u mms-gps-gateway -n 10 -f --no-pager"
```

Allow up to three minutes with the configured ignition-off interval. A new device can produce:

```text
[gateway] unregistered/unassigned device <DEVICE_ID> — dropping
```

Copy that exact device ID. H02 devices can report an ID different from the full printed IMEI. The current decoder supports ST-901L-X `V6` and `V8` position messages and `H1` heartbeats.

Press **Ctrl+C** when finished watching. This closes the log viewer without stopping the gateway service.

## 6 Register and assign the tracker in MMS

1. Sign in to the MMS app as an **Admin**.
2. Open **Vehicles** and confirm the car has the correct vehicle record. Enter its actual make, model, plate, and recorded odometer; the GPS does not supply these vehicle details.
3. Open **Trackers**, then **Register Device**.
4. Enter the exact ID from the gateway log in the **IMEI** field.
5. Give it a useful label, such as its model and vehicle plate. Record its SIM number if needed.
6. Select the correct vehicle and set the tracker status to **Active**.
7. Save and confirm registration.

Only one active tracker can be assigned to a vehicle. When replacing a unit, mark the previous tracker inactive before assigning its replacement. Do not reuse another tracker's ID.

Restart the gateway after registration to clear its cached device lookup:

```bash
gcloud compute ssh mms-gps-gateway \
  --project=um-mms-gps \
  --zone=us-central1-a \
  --command="sudo systemctl restart mms-gps-gateway"
```

This restarts the shared service, so existing trackers may briefly reconnect as well.

## 7 Verify the car and app together

1. Keep the tracker powered and allow up to three minutes for its next report.
2. Refresh **Trackers**. Confirm the correct vehicle assignment, **Active** status, and a recent **Last Seen** value.
3. Open **GPS Map** and select the vehicle. Confirm its position matches the car's actual location. Check **Update age**, reported speed and ignition, and tracker connection in the main panel. Positions refresh every five seconds; the hardware must also send reports at the desired interval.
4. Ask a passenger or helper to monitor a short movement test. Confirm that the marker follows the vehicle and reported speed changes.
5. Compare ignition information with the car's ACC state. Have the installer check the ACC connection if it is wrong.

Missing telemetry is shown as **Unknown**. A measured speed of `0 km/h` and heading `0°` are valid readings. Vehicle fleet status is maintained by the app's trip and maintenance workflows; it is separate from GPS movement and ignition.

The app displays timestamps in the viewer's browser timezone. An operator abroad may see a different clock time from an operator in the Philippines.

If speed appears consistently scaled, ask the maintainer to check the gateway's `SPEED_UNIT`. That setting is shared by all connected trackers.

### View a recorded route

Select the vehicle, then choose **Route history**. Use a preset such as **Last hour**, or set **From** and **To** and press **Load route**. Each view covers up to 24 hours, including older dates. **Route start** and **Route end** identify the first and last reports in that period. Lines connect recorded reports; missing intervals remain gaps. The telemetry panel above continues to show the latest report, separate from the historical route.

### Save the tracker's configuration

Open **Trackers**, open the device, then choose **Update from RCONF**. Send `RCONF` by SMS to that device and paste its reply. Its device ID must match the tracker record. Saving records the reported model, firmware, APN, server, reporting intervals, timezone, and supported alarm settings with a date. Passwords, control numbers, and APN credentials are discarded.

**Last confirmed configuration** is a dated snapshot. MMS does not automatically read hardware settings. Request and save a fresh reply after changing them. Saving a reply in MMS does not change the device.

## Closing browser tabs and keeping tracking running

**You can close Cloud Shell, close the MMS app, or turn off the setup computer after installation.** The tracker uses its own SIM and vehicle power, while the gateway runs as an enabled background systemd service on the cloud VM. The MMS API stores positions independently of an open browser.

Keep the gateway VM running, Google Cloud billing active, the API/database available, and the tracker powered with working SIM data. Stopping the VM or its gateway service stops incoming tracking. The enabled gateway service starts again when the VM boots.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| SMS gets no reply | SIM number, SMS credit/service, power, reception, and command password |
| `SET OK`, but `RCONF` still has the old server | Request a fresh `RCONF` after the server-setting acknowledgement |
| No new gateway messages | Power, APN, mobile-data plan, server IP/port, and gateway service |
| `unregistered/unassigned` | Exact reported ID, Active status, assignment, then restart the gateway |
| `unknown frame` for `V6`, `V8`, or `H1` | Gateway is running an older decoder; have the maintainer update and rebuild it |
| Online, but no recent map position | GPS fix, fresh valid position reports, API forwarding errors, and assignment |
| Wrong ignition state | ACC wiring and actual ignition state |
| Old dates or an unrelated vehicle on the map | Check tracker assignment and reported timestamps; do not treat historical test points as a current car location |

For support, share the device model, reported ID, MODE, APN, IP/port, and relevant gateway errors. Remove the SMS password and personal phone numbers from shared configuration replies.

## References

- [ST-901L 4G four-pin manufacturer manual](https://manuals.plus/m/360a01cbf0d3beb8ddedbd9e8d786a51c9d1a641b4b5769da681be44b4be9ece.pdf)
- [Gateway deployment and maintenance](gps-deployment.md)
- [Initial infrastructure setup](real-gps-hardware-connection.md)
- [Legacy simulated-history cleanup](gps-history-cleanup.md)
