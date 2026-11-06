import { describe, expect, it, vi } from 'vitest';
import { FrameBuffer } from './framing.js';

const A = '*HQ,1,V1,a#';
const B = '*HQ,2,V1,b#';

describe('FrameBuffer', () => {
  it('emits a whole frame', () => {
    expect(new FrameBuffer().push(Buffer.from(A))).toEqual([A]);
  });

  it('reassembles a frame split across chunks', () => {
    const buf = new FrameBuffer();
    expect(buf.push(Buffer.from('*HQ,1,V1'))).toEqual([]);
    expect(buf.push(Buffer.from(',a#'))).toEqual([A]);
  });

  it('emits multiple frames arriving in one chunk', () => {
    expect(new FrameBuffer().push(Buffer.from(A + B))).toEqual([A, B]);
  });

  it('drops leading binary/noise before the next frame', () => {
    const noise = Buffer.from([0x24, 0x01, 0x02, 0xff]); // a binary '$' frame
    expect(
      new FrameBuffer().push(Buffer.concat([noise, Buffer.from(A)]))
    ).toEqual([A]);
  });

  it('does not grow without bound on garbage', () => {
    const buf = new FrameBuffer(16);
    expect(buf.push(Buffer.from('x'.repeat(64)))).toEqual([]);
    expect(buf.push(Buffer.from(A))).toEqual([A]);
  });

  it('preserves discarded binary prefixes as reversible diagnostics', () => {
    const discarded = vi.fn();
    const noise = Buffer.from([0x24, 0x00, 0xff]);
    const buffer = new FrameBuffer(8192, discarded);
    expect(buffer.push(Buffer.concat([noise, Buffer.from(A)]))).toEqual([A]);
    expect(discarded).toHaveBeenCalledWith(noise.toString('latin1'), 'unknown');
  });

  it('flushes an unfinished message once when the connection closes', () => {
    const discarded = vi.fn();
    const buffer = new FrameBuffer(8192, discarded);
    buffer.push(Buffer.from('*HQ,tracker,V6'));
    buffer.flush();
    buffer.flush();
    expect(discarded).toHaveBeenCalledTimes(1);
    expect(discarded).toHaveBeenCalledWith('*HQ,tracker,V6', 'incomplete');
  });

  it('preserves an oversized terminated message in bounded fragments without forwarding it', () => {
    const discarded = vi.fn();
    const buffer = new FrameBuffer(16, discarded);
    const raw = '*HQ,' + 'x'.repeat(48) + '#';
    expect(buffer.push(Buffer.from(raw + A))).toEqual([A]);
    expect(discarded.mock.calls.map(([text]) => text).join('')).toBe(raw);
    expect(
      discarded.mock.calls.every(
        ([text, reason]) => text.length <= 16 && reason === 'oversized'
      )
    ).toBe(true);
  });
});
