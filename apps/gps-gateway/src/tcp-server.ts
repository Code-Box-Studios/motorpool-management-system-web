import net from 'node:net';
import { FrameBuffer } from './framing.js';

export interface TcpServerOptions {
  port: number;
  idleTimeoutMs: number;
  onFrame: (raw: string, peer: string) => void;
  onError?: (error: Error, peer: string) => void;
}

/**
 * Owns the socket lifecycle. Each connection gets its own FrameBuffer; complete
 * frames go to `onFrame`. A silent socket is closed after `idleTimeoutMs` —
 * the tracker reconnects on its own.
 */
export function startTcpServer(options: TcpServerOptions): Promise<net.Server> {
  const server = net.createServer((socket) => {
    const peer = `${socket.remoteAddress ?? '?'}:${socket.remotePort ?? '?'}`;
    const frames = new FrameBuffer();

    socket.setTimeout(options.idleTimeoutMs, () => socket.destroy());
    socket.on('data', (chunk: Buffer) => {
      for (const raw of frames.push(chunk)) options.onFrame(raw, peer);
    });
    socket.on('error', (error) => options.onError?.(error, peer));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, () => resolve(server));
  });
}
