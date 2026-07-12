import { describe, expect, it } from 'vitest';
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
    expect(new FrameBuffer().push(Buffer.concat([noise, Buffer.from(A)]))).toEqual([A]);
  });

  it('does not grow without bound on garbage', () => {
    const buf = new FrameBuffer(16);
    expect(buf.push(Buffer.from('x'.repeat(64)))).toEqual([]);
    expect(buf.push(Buffer.from(A))).toEqual([A]);
  });
});
