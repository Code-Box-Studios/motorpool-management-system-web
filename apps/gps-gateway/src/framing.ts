const DEFAULT_MAX_BUFFER = 8192;

/**
 * Turns a TCP byte stream into complete `*…#` H02 text frames.
 * Bytes before a `*` (e.g. the device's interleaved binary frames) are dropped —
 * we deliberately do not decode the binary variant.
 */
export class FrameBuffer {
  private buffer = '';

  constructor(private readonly maxBuffer: number = DEFAULT_MAX_BUFFER) {}

  push(chunk: Buffer): string[] {
    // latin1 keeps every byte 1:1 so binary noise cannot corrupt the string.
    this.buffer += chunk.toString('latin1');
    const frames: string[] = [];

    for (;;) {
      const start = this.buffer.indexOf('*');
      if (start === -1) {
        if (this.buffer.length > this.maxBuffer) this.buffer = '';
        break;
      }
      if (start > 0) this.buffer = this.buffer.slice(start);

      const end = this.buffer.indexOf('#');
      if (end === -1) {
        if (this.buffer.length > this.maxBuffer) this.buffer = '';
        break;
      }
      frames.push(this.buffer.slice(0, end + 1));
      this.buffer = this.buffer.slice(end + 1);
    }
    return frames;
  }
}
