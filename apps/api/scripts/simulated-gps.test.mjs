import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifySimulatedGpsPoint } from './simulated-gps.mjs';

const before = new Date('2026-11-06T05:36:19Z');
const seedPoint = {
  tripId: null,
  latitude: 14.5995,
  longitude: 120.9842,
  speed: 30,
  heading: 90,
  engineStatus: 'on',
  createdAt: new Date('2026-07-01T08:00:00Z')
};
const browserPoint = {
  ...seedPoint,
  latitude: 7.0731,
  longitude: 125.6128,
  speed: 41.25,
  heading: 44.781024213702324,
  createdAt: new Date('2026-10-25T10:00:00Z')
};

test('identifies the exact first and last seed points for both seeded routes', () => {
  assert.equal(classifySimulatedGpsPoint(seedPoint, before), 'seed');
  assert.equal(
    classifySimulatedGpsPoint({ ...seedPoint, latitude: 14.6095 }, before),
    'seed'
  );
  assert.equal(
    classifySimulatedGpsPoint(
      {
        ...seedPoint,
        latitude: 14.6115,
        longitude: 121.001,
        speed: 34,
        createdAt: new Date('2026-07-01T08:24:00Z')
      },
      before
    ),
    'seed'
  );
});

test('preserves real-looking points that differ from any part of the seed fingerprint', () => {
  for (const overrides of [
    { latitude: 14.5996 },
    { longitude: 120.9843 },
    { speed: 31 },
    { heading: 91 },
    { engineStatus: 'off' },
    { createdAt: new Date('2026-07-01T08:00:01Z') }
  ])
    assert.equal(
      classifySimulatedGpsPoint({ ...seedPoint, ...overrides }, before),
      null
    );
});

test('identifies a browser demo route only with its generated heading and speed range', () => {
  assert.equal(classifySimulatedGpsPoint(browserPoint, before), 'browser-demo');
  for (const overrides of [
    { latitude: 7.0731001 },
    { heading: 44.78 },
    { speed: 29.99 },
    { speed: 50 },
    { engineStatus: 'off' }
  ])
    assert.equal(
      classifySimulatedGpsPoint({ ...browserPoint, ...overrides }, before),
      null
    );
});

test('preserves every point at or after the live-data cutoff', () => {
  for (const createdAt of [before, new Date('2026-11-06T06:10:48Z')]) {
    assert.equal(
      classifySimulatedGpsPoint({ ...browserPoint, createdAt }, before),
      null
    );
  }
});

test('identifies the development TCP simulator only on its route with its fixed telemetry', () => {
  assert.equal(
    classifySimulatedGpsPoint(
      { ...browserPoint, speed: 37.04, heading: 90 },
      before
    ),
    'tcp-simulator'
  );
  assert.equal(
    classifySimulatedGpsPoint(
      { ...browserPoint, speed: 20, heading: 90 },
      before
    ),
    'tcp-simulator'
  );
  assert.equal(
    classifySimulatedGpsPoint(
      { ...browserPoint, speed: 37, heading: 90 },
      before
    ),
    null
  );
});

test('preserves trip-linked points and incomplete or nonfinite telemetry', () => {
  for (const overrides of [
    { tripId: 'a-real-trip' },
    { latitude: null },
    { longitude: NaN },
    { speed: null },
    { heading: undefined },
    { createdAt: 'invalid' }
  ])
    assert.equal(
      classifySimulatedGpsPoint({ ...browserPoint, ...overrides }, before),
      null
    );
});

test('an invalid cutoff never makes a point eligible for deletion', () => {
  assert.equal(classifySimulatedGpsPoint(seedPoint, new Date('invalid')), null);
});
