const DEFAULT_MAX_BUFFER = 8192;

export type FragmentReason = 'unknown' | 'oversized' | 'incomplete';

/**
 * Turns a TCP byte stream into complete `*…#` H02 text frames.
 * Bytes outside supported framing are emitted separately for diagnostics.
 */
export class FrameBuffer {
  private buffer = '';

  constructor(
    private readonly maxBuffer: number = DEFAULT_MAX_BUFFER,
    private readonly onDiscard?: (raw: string, reason: FragmentReason) => void
  ) {}

  private discard(raw: string, reason: FragmentReason): void {
    for (let offset = 0; offset < raw.length; offset += this.maxBuffer) {
      this.onDiscard?.(raw.slice(offset, offset + this.maxBuffer), reason);
    }
  }

  flush(): void {
    this.discard(this.buffer, 'incomplete');
    this.buffer = '';
  }

  push(chunk: Buffer): string[] {
    // latin1 keeps every byte 1:1 so binary noise cannot corrupt the string.
    this.buffer += chunk.toString('latin1');
    const frames: string[] = [];

    for (;;) {
      const start = this.buffer.indexOf('*');
      if (start === -1) {
        this.discard(this.buffer, 'unknown');
        this.buffer = '';
        break;
      }
      if (start > 0) {
        this.discard(this.buffer.slice(0, start), 'unknown');
        this.buffer = this.buffer.slice(start);
      }

      const end = this.buffer.indexOf('#');
      if (end === -1) {
        if (this.buffer.length > this.maxBuffer) {
          this.discard(this.buffer, 'oversized');
          this.buffer = '';
        }
        break;
      }
      const raw = this.buffer.slice(0, end + 1);
      if (raw.length > this.maxBuffer) this.discard(raw, 'oversized');
      else frames.push(raw);
      this.buffer = this.buffer.slice(end + 1);
    }
    return frames;
  }
}
