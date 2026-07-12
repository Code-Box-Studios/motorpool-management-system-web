import 'dotenv/config';
import net from 'node:net';

// Replays H02 position frames at the gateway so the whole pipeline (and the
// dashboard map) can be exercised without the physical tracker.
// Usage: pnpm --filter @mms/gps-gateway simulate <imei> [host] [port]
const imei = process.argv[2] ?? '1234567890';
const host = process.argv[3] ?? '127.0.0.1';
const port = Number(process.argv[4] ?? process.env.GATEWAY_TCP_PORT ?? 5013);

// A short drive through Davao City (matches the dashboard's map centre).
const route = [
  [7.0731, 125.6128],
  [7.0745, 125.6142],
  [7.076, 125.6155],
  [7.078, 125.617],
  [7.08, 125.619]
] as const;

// decimal degrees -> ddmm.mmmm / dddmm.mmmm
function toDm(value: number, degreeDigits: number): string {
  const abs = Math.abs(value);
  const degrees = Math.floor(abs);
  const minutes = (abs - degrees) * 60;
  return `${String(degrees).padStart(degreeDigits, '0')}${minutes.toFixed(4).padStart(7, '0')}`;
}

function frameFor(lat: number, lon: number): string {
  const now = new Date();
  const hhmmss =
    String(now.getUTCHours()).padStart(2, '0') +
    String(now.getUTCMinutes()).padStart(2, '0') +
    String(now.getUTCSeconds()).padStart(2, '0');
  const ddmmyy =
    String(now.getUTCDate()).padStart(2, '0') +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCFullYear() % 100).padStart(2, '0');
  // status 00000400 == bit 10 set == ignition ON
  return `*HQ,${imei},V1,${hhmmss},A,${toDm(lat, 2)},N,${toDm(lon, 3)},E,020.00,090,${ddmmyy},00000400,000,00,0,0#`;
}

const socket = net.createConnection({ host, port }, () => {
  console.log(`simulator connected to ${host}:${port} as ${imei}`);
  let i = 0;
  setInterval(() => {
    const point = route[i % route.length];
    if (!point) return;
    const frame = frameFor(point[0], point[1]);
    socket.write(frame);
    console.log(`sent ${frame}`);
    i += 1;
  }, 3000);
});
socket.on('error', (error) => console.error('simulator error:', error.message));
