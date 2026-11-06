// Historical fingerprints for cleanup only. These are never sent to ingest.
const BROWSER_ROUTE = [
  [7.0731, 125.6128, 44.781024213702324],
  [7.0745, 125.6142, 40.697664403575345],
  [7.076, 125.6155, 36.65970546673259],
  [7.078, 125.617, 44.780664431183425],
  [7.08, 125.619, 44.780540198072345],
  [7.082, 125.621, 44.780323204500974],
  [7.085, 125.624, 44.78013669594321],
  [7.088, 125.627, 223.40387753418452]
];
const SEED_START = Date.parse('2026-07-01T08:00:00Z');
const near = (actual, expected) => Math.abs(actual - expected) < 1e-9;

/** Classify only known legacy GPS simulation fingerprints before a cutoff. */
export function classifySimulatedGpsPoint(point, before) {
  const timestamp = new Date(point.createdAt).getTime();
  const cutoff = new Date(before).getTime();
  if (
    !Number.isFinite(timestamp) ||
    !Number.isFinite(cutoff) ||
    timestamp >= cutoff
  )
    return null;
  if (point.tripId != null || point.engineStatus !== 'on') return null;
  if (
    ![point.latitude, point.longitude, point.speed, point.heading].every(
      Number.isFinite
    )
  )
    return null;

  const step = (timestamp - SEED_START) / 60_000;
  if (
    Number.isInteger(step) &&
    step >= 0 &&
    step < 25 &&
    point.speed === 30 + (step % 20) &&
    point.heading === 90 &&
    near(point.longitude, 120.9842 + step * 0.0007) &&
    [0, 1].some((route) =>
      near(point.latitude, 14.5995 + route * 0.01 + step * 0.0005)
    )
  ) {
    return 'seed';
  }

  const routeIndex = BROWSER_ROUTE.findIndex(
    ([lat, lon]) => near(point.latitude, lat) && near(point.longitude, lon)
  );
  if (routeIndex === -1) return null;
  if (
    point.speed >= 30 &&
    point.speed < 50 &&
    near(point.heading, BROWSER_ROUTE[routeIndex][2])
  ) {
    return 'browser-demo';
  }
  if (
    routeIndex < 5 &&
    point.heading === 90 &&
    (near(point.speed, 37.04) || point.speed === 20)
  ) {
    return 'tcp-simulator';
  }
  return null;
}
