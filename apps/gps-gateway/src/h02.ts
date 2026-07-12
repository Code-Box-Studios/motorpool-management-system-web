export type DecodedFrame =
  | {
      kind: 'position';
      deviceId: string;
      valid: boolean;
      latitude: number;
      longitude: number;
      speedKmh: number | null;
      heading: number | null;
      ignition: boolean | null;
      fixTime: Date | null;
      raw: string;
    }
  | { kind: 'heartbeat'; deviceId: string; raw: string }
  | { kind: 'unknown'; raw: string };

const KNOTS_TO_KMH = 1.852;
const POSITION_TYPES = new Set(['V1', 'V5']);
const HEARTBEAT_TYPES = new Set(['V0', 'HTBT']);

// `ddmm.mmmm` / `dddmm.mmmm` — the last two digits BEFORE the dot are minutes.
function dmToDecimal(value: string, hemisphere: string): number | null {
  const dot = value.indexOf('.');
  const intPart = dot === -1 ? value : value.slice(0, dot);
  if (intPart.length < 3) return null;
  const degrees = Number(intPart.slice(0, intPart.length - 2));
  const minutes = Number(value.slice(intPart.length - 2));
  if (!Number.isFinite(degrees) || !Number.isFinite(minutes)) return null;
  const decimal = degrees + minutes / 60;
  return hemisphere === 'S' || hemisphere === 'W' ? -decimal : decimal;
}

// Status is 8 hex chars (32 bits) — use >>> so it is treated as unsigned.
function ignitionFromStatus(statusHex: string): boolean | null {
  const status = Number.parseInt(statusHex, 16);
  if (!Number.isFinite(status)) return null;
  return ((status >>> 10) & 1) === 1;
}

function parseFixTime(hhmmss: string, ddmmyy: string): Date | null {
  if (hhmmss.length < 6 || ddmmyy.length < 6) return null;
  const hh = Number(hhmmss.slice(0, 2));
  const mi = Number(hhmmss.slice(2, 4));
  const ss = Number(hhmmss.slice(4, 6));
  const dd = Number(ddmmyy.slice(0, 2));
  const mo = Number(ddmmyy.slice(2, 4));
  const yy = Number(ddmmyy.slice(4, 6));
  if ([hh, mi, ss, dd, mo, yy].some((n) => !Number.isFinite(n))) return null;
  const ms = Date.UTC(2000 + yy, mo - 1, dd, hh, mi, ss);
  return Number.isNaN(ms) ? null : new Date(ms);
}

function toNumberOrNull(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Decodes one H02 text frame: `*HQ,<imei>,<type>,<hhmmss>,<A|V>,<lat>,<N|S>,<lon>,<E|W>,<speed>,<course>,<ddmmyy>,<status>[,...]#`
 * Pure: no I/O, no state. Anything it cannot confidently parse is `unknown`.
 */
export function decodeFrame(raw: string, speedUnit: 'knots' | 'kmh'): DecodedFrame {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('*') || !trimmed.endsWith('#')) return { kind: 'unknown', raw };

  const parts = trimmed.slice(1, -1).split(',');
  const deviceId = parts[1];
  const type = parts[2];
  if (!deviceId || !type) return { kind: 'unknown', raw };

  if (HEARTBEAT_TYPES.has(type)) return { kind: 'heartbeat', deviceId, raw };
  if (!POSITION_TYPES.has(type)) return { kind: 'unknown', raw };

  const [, , , time, validity, lat, ns, lon, ew, speed, course, date, status] = parts;
  if (!time || !validity || !lat || !ns || !lon || !ew || !date) return { kind: 'unknown', raw };

  const latitude = dmToDecimal(lat, ns);
  const longitude = dmToDecimal(lon, ew);
  if (latitude === null || longitude === null) return { kind: 'unknown', raw };

  const rawSpeed = toNumberOrNull(speed);
  const speedKmh =
    rawSpeed === null ? null : speedUnit === 'knots' ? rawSpeed * KNOTS_TO_KMH : rawSpeed;

  return {
    kind: 'position',
    deviceId,
    valid: validity === 'A',
    latitude,
    longitude,
    speedKmh,
    heading: toNumberOrNull(course),
    ignition: status ? ignitionFromStatus(status) : null,
    fixTime: parseFixTime(time, date),
    raw
  };
}
