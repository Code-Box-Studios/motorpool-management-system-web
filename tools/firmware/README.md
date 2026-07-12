# Firmware / device paths

There are two, and they are different:

- **`gps_esp32_supabase.ino` / `gpsTst.ino` — the custom ESP32 tracker.** A DIY device
  (ESP32 + NEO-6M) running our own code over **WiFi**, POSTing JSON straight to
  `POST /api/gps/ingest` with a hardcoded vehicle UUID. Prototype/demo path.

- **SinoTrack ST-901 — the off-the-shelf tracker.** A sealed **2G** device. It cannot run
  custom firmware and does not speak HTTP/JSON: it opens a raw TCP socket and streams the
  H02 protocol, identified by IMEI. It talks to `apps/gps-gateway`, which translates and
  forwards to the same ingest endpoint.

Both paths end at the same door (`/api/gps/ingest`); only the ESP32 one involves firmware
you can edit.
