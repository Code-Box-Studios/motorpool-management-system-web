const DAY = 86_400_000;
const MAX_GAP_MS = 15 * 60_000;

/** Inclusive Manila calendar dates become a half-open interval of instants. */
export function reportDateRange(
  from?: string,
  to?: string
): { gte?: Date; lt?: Date } {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new RangeError('Invalid report date');
    const utc = new Date(`${value}T00:00:00.000Z`);
    if (
      !Number.isFinite(utc.getTime()) ||
      utc.toISOString().slice(0, 10) !== value
    )
      throw new RangeError('Invalid report date');
    return new Date(`${value}T00:00:00+08:00`);
  };
  const gte = from ? parse(from) : undefined;
  const last = to ? parse(to) : undefined;
  if (gte && last && gte > last)
    throw new RangeError('End date must follow start date');
  return {
    ...(gte ? { gte } : {}),
    ...(last ? { lt: new Date(last.getTime() + DAY) } : {})
  };
}

export function estimateFuel(
  liters: number,
  distanceKm: number,
  plannedKm?: number,
  proposedLiters?: number
) {
  if (
    ![liters, distanceKm].every((n) => Number.isFinite(n) && n > 0) ||
    plannedKm === undefined ||
    !Number.isFinite(plannedKm) ||
    plannedKm <= 0 ||
    (proposedLiters !== undefined &&
      (!Number.isFinite(proposedLiters) || proposedLiters < 0))
  )
    return null;
  const rate = liters / distanceKm;
  const estimatedLiters = plannedKm * rate;
  return {
    rate,
    estimatedLiters,
    proposedLiters: proposedLiters ?? null,
    difference:
      proposedLiters === undefined ? null : proposedLiters - estimatedLiters
  };
}

interface GpsPoint {
  createdAt: Date;
  latitude: number | null;
  longitude: number | null;
}
const radians = (n: number) => (n * Math.PI) / 180;
function segmentKm(a: GpsPoint, b: GpsPoint) {
  const lat1 = radians(a.latitude!),
    lat2 = radians(b.latitude!);
  const dLat = lat2 - lat1,
    dLon = radians(b.longitude! - a.longitude!);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return (
    6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
  );
}

/** Reject incomplete traces; an incomplete trace cannot establish an allocation rate. */
export function gpsDistance(
  samples: GpsPoint[],
  start: Date,
  end: Date
): { distanceKm: number | null; reason: string | null } {
  const fail = (reason: string) => ({ distanceKm: null, reason });
  if (end <= start) return fail('Invalid gate interval');
  const points = samples
    .filter(
      (p) =>
        p.createdAt >= start &&
        p.createdAt <= end &&
        p.latitude !== null &&
        p.longitude !== null &&
        Number.isFinite(p.latitude) &&
        Number.isFinite(p.longitude) &&
        Math.abs(p.latitude) <= 90 &&
        Math.abs(p.longitude) <= 180
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  if (points.length < 2) return fail('Insufficient valid GPS samples');
  if (
    points[0]!.createdAt.getTime() - start.getTime() > MAX_GAP_MS ||
    end.getTime() - points.at(-1)!.createdAt.getTime() > MAX_GAP_MS
  )
    return fail('Incomplete GPS coverage at the gate boundaries');
  let distanceKm = 0;
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1]!,
      current = points[i]!;
    const elapsed = current.createdAt.getTime() - previous.createdAt.getTime();
    if (elapsed > MAX_GAP_MS) return fail('GPS sample gap exceeds 15 minutes');
    const distance = segmentKm(previous, current);
    if (
      (elapsed <= 0 && distance > 0.01) ||
      (elapsed > 0 && distance / (elapsed / 3_600_000) > 180)
    )
      return fail('Implausible GPS speed exceeds 180 km/h');
    distanceKm += distance;
  }
  if (distanceKm <= 0) return fail('Zero recorded GPS distance');
  return { distanceKm, reason: null };
}
