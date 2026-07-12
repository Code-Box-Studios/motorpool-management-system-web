import { describe, expect, it } from 'vitest';
import { decodeFrame } from './h02.js';

// A representative ST-901 position frame (documented H02 layout).
const POSITION =
  '*HQ,1234567890,V1,084739,A,3123.4537,N,12112.3427,E,010.00,090,200420,FFFFFDFF,000,00,0,0#';

describe('decodeFrame', () => {
  it('decodes a valid position, converting ddmm.mmmm to decimal degrees', () => {
    const frame = decodeFrame(POSITION, 'knots');
    expect(frame.kind).toBe('position');
    if (frame.kind !== 'position') return;
    expect(frame.deviceId).toBe('1234567890');
    expect(frame.valid).toBe(true);
    expect(frame.latitude).toBeCloseTo(31.390895, 5);
    expect(frame.longitude).toBeCloseTo(121.205712, 5);
    expect(frame.heading).toBe(90);
    // 10 knots -> km/h
    expect(frame.speedKmh).toBeCloseTo(18.52, 2);
    expect(frame.fixTime?.toISOString()).toBe('2020-04-20T08:47:39.000Z');
  });

  it('treats the speed as km/h when configured that way', () => {
    const frame = decodeFrame(POSITION, 'kmh');
    if (frame.kind !== 'position') throw new Error('expected position');
    expect(frame.speedKmh).toBeCloseTo(10, 5);
  });

  it('negates southern and western hemispheres', () => {
    const raw = POSITION.replace(',N,', ',S,').replace(',E,', ',W,');
    const frame = decodeFrame(raw, 'knots');
    if (frame.kind !== 'position') throw new Error('expected position');
    expect(frame.latitude).toBeCloseTo(-31.390895, 5);
    expect(frame.longitude).toBeCloseTo(-121.205712, 5);
  });

  it('marks a void fix (V) as invalid', () => {
    const frame = decodeFrame(POSITION.replace(',A,', ',V,'), 'knots');
    if (frame.kind !== 'position') throw new Error('expected position');
    expect(frame.valid).toBe(false);
  });

  it('reads ignition from bit 10 of the status word', () => {
    // bit 10 set -> ignition on. 0x00000400 == bit 10.
    const on = decodeFrame(POSITION.replace(',FFFFFDFF,', ',00000400,'), 'knots');
    if (on.kind !== 'position') throw new Error('expected position');
    expect(on.ignition).toBe(true);

    const off = decodeFrame(POSITION.replace(',FFFFFDFF,', ',00000000,'), 'knots');
    if (off.kind !== 'position') throw new Error('expected position');
    expect(off.ignition).toBe(false);
  });

  it('uses unsigned shifting so a high status word still parses', () => {
    // 0xFFFFFFFF has bit 10 set; a signed >> would still work here, but the
    // decoder must not produce NaN/garbage for a full 32-bit status.
    const frame = decodeFrame(POSITION.replace(',FFFFFDFF,', ',FFFFFFFF,'), 'knots');
    if (frame.kind !== 'position') throw new Error('expected position');
    expect(frame.ignition).toBe(true);
  });

  it('recognises heartbeats', () => {
    const frame = decodeFrame('*HQ,1234567890,V0,084739#', 'knots');
    expect(frame.kind).toBe('heartbeat');
    if (frame.kind !== 'heartbeat') return;
    expect(frame.deviceId).toBe('1234567890');
  });

  it('returns unknown for other message types and malformed input', () => {
    expect(decodeFrame('*HQ,1234567890,LINK,084739,1,2,3#', 'knots').kind).toBe('unknown');
    expect(decodeFrame('garbage', 'knots').kind).toBe('unknown');
    expect(decodeFrame('*HQ,123,V1,084739,A#', 'knots').kind).toBe('unknown');
  });
});
