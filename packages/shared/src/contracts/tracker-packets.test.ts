import { describe, expect, it } from 'vitest';
import {
  TRACKER_PACKET_KINDS,
  TRACKER_PACKET_OUTCOMES,
  trackerPacketBodySchema,
  trackerPacketQuerySchema
} from './tracker-packets.js';

const receipt = {
  id: '72c77ff0-0577-4bfa-9c05-a4cafda01d55',
  revision: 0,
  receivedAt: '2026-11-06T10:00:00.123Z',
  connectionId: '3fbaaa35-9332-449a-baba-42bbf26ccdeb',
  peer: '127.0.0.1:5013',
  deviceId: null,
  vehicleId: null,
  messageType: null,
  kind: 'fragment',
  outcome: 'received',
  rawHex: '00ff2a23',
  fixTime: null,
  latitude: null,
  longitude: null,
  speed: null,
  heading: null,
  ignition: null,
  reason: null
};

describe('tracker packet upload contract', () => {
  it('keeps exact bytes and unknown identity, including an empty socket-error payload', () => {
    expect(trackerPacketBodySchema.parse(receipt)).toEqual(receipt);
    expect(
      trackerPacketBodySchema.safeParse({
        ...receipt,
        kind: 'socket_error',
        rawHex: ''
      }).success
    ).toBe(true);
    expect(TRACKER_PACKET_KINDS).toContain('position');
    expect(TRACKER_PACKET_OUTCOMES).toContain('resolution_error');
  });

  it('accepts finite decoded diagnostics outside position-ingest bounds', () => {
    expect(
      trackerPacketBodySchema.parse({
        ...receipt,
        revision: 1,
        outcome: 'invalid_fix',
        latitude: 999,
        longitude: -999,
        speed: -3,
        heading: 500,
        ignition: false,
        fixTime: '2026-11-06T09:59:00Z'
      }).latitude
    ).toBe(999);
  });

  it.each(['peer', 'deviceId', 'messageType', 'reason'])(
    'rejects embedded NUL in %s while preserving raw zero bytes',
    (field) => {
      expect(
        trackerPacketBodySchema.safeParse({
          ...receipt,
          [field]: 'before\u0000after'
        }).success
      ).toBe(false);
      expect(
        trackerPacketBodySchema.parse({ ...receipt, rawHex: '0000ff00' }).rawHex
      ).toBe('0000ff00');
    }
  );

  it.each([
    { revision: 0, outcome: 'saved' },
    { revision: 1, outcome: 'received' },
    { revision: 2 },
    { revision: '1' },
    { id: 'bad-id' },
    { connectionId: 'bad-id' },
    { vehicleId: 'bad-id' },
    { rawHex: '001' },
    { rawHex: 'xx' },
    { rawHex: 'ab'.repeat(8193) },
    { receivedAt: 'yesterday' },
    { receivedAt: '2026-11-06T10:00:00+08:00' },
    { fixTime: '2026-02-30T00:00:00Z' },
    { latitude: Infinity },
    { longitude: NaN },
    { speed: '12' },
    { heading: -Infinity },
    { ignition: 'true' },
    { kind: 'unsupported' },
    { outcome: 'bogus' },
    { peer: 'a'.repeat(257) },
    { deviceId: 'a'.repeat(129) },
    { messageType: 'a'.repeat(33) },
    { reason: 'a'.repeat(2001) }
  ])('rejects invalid packet fields %j', (patch) => {
    expect(
      trackerPacketBodySchema.safeParse({ ...receipt, ...patch }).success
    ).toBe(false);
  });

  it('accepts each maximum payload and text bound', () => {
    expect(
      trackerPacketBodySchema.safeParse({
        ...receipt,
        rawHex: 'AB'.repeat(8192),
        peer: 'p'.repeat(256),
        deviceId: 'd'.repeat(128),
        messageType: 'm'.repeat(32),
        reason: 'r'.repeat(2000)
      }).success
    ).toBe(true);
  });
});

describe('tracker packet query contract', () => {
  it.each(['deviceId', 'search'])(
    'rejects embedded NUL in %s filters',
    (field) => {
      expect(
        trackerPacketQuerySchema.safeParse({ [field]: 'before\u0000after' })
          .success
      ).toBe(false);
    }
  );

  it('defaults to 25 rows and accepts all filters', () => {
    expect(trackerPacketQuerySchema.parse({})).toEqual({ limit: 25 });
    expect(
      trackerPacketQuerySchema.parse({
        deviceId: '123',
        search: '12',
        kind: 'position',
        outcome: 'saved',
        from: '2026-11-06T00:00:00Z',
        to: '2026-11-06T10:00:00Z',
        limit: '100',
        cursor: `${receipt.receivedAt}|${receipt.id}`
      }).limit
    ).toBe(100);
  });

  it.each([
    { limit: '101' },
    { limit: '0' },
    { limit: '1.5' },
    { from: 'tomorrow' },
    { to: '2026-02-30T00:00:00Z' },
    { from: '2026-11-06T10:00:00Z', to: '2026-11-06T09:00:00Z' },
    { cursor: 'nonsense' },
    { cursor: `${receipt.receivedAt}|bad-id` },
    { cursor: `not-a-date|${receipt.id}` },
    { cursor: `${receipt.receivedAt}|${receipt.id}|extra` },
    { deviceId: 'x'.repeat(129) },
    { search: 'x'.repeat(129) },
    { kind: 'bogus' },
    { outcome: 'bogus' }
  ])('rejects invalid filters %j', (query) => {
    expect(trackerPacketQuerySchema.safeParse(query).success).toBe(false);
  });
});
