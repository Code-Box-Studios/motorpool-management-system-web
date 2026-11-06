import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { FrameBuffer, type FragmentReason } from './framing.js';

export interface TcpServerOptions {
  port: number;
  idleTimeoutMs: number;
  onFrame: (raw: string, peer: string, connectionId: string) => void;
  onFragment?: (
    raw: string,
    reason: FragmentReason,
    peer: string,
    connectionId: string
  ) => void;
  onError?: (error: Error, peer: string, connectionId: string) => void;
}

export type TrackerTcpServer = net.Server & { closeConnections(): void };

/**
 * Owns the socket lifecycle. Each connection gets its own FrameBuffer; complete
 * frames go to `onFrame`. A silent socket is closed after `idleTimeoutMs` —
 * the tracker reconnects on its own.
 */
export function startTcpServer(
  options: TcpServerOptions
): Promise<TrackerTcpServer> {
  const sockets = new Map<net.Socket, () => void>();
  const server = net.createServer((socket) => {
    const peer = `${socket.remoteAddress ?? '?'}:${socket.remotePort ?? '?'}`;
    const connectionId = randomUUID();
    const frames = new FrameBuffer(8192, (raw, reason) =>
      options.onFragment?.(raw, reason, peer, connectionId)
    );
    sockets.set(socket, () => frames.flush());

    socket.setTimeout(options.idleTimeoutMs, () => {
      options.onError?.(new Error('Socket idle timeout'), peer, connectionId);
      socket.destroy();
    });
    socket.on('data', (chunk: Buffer) => {
      for (const raw of frames.push(chunk))
        options.onFrame(raw, peer, connectionId);
    });
    socket.on('error', (error) => options.onError?.(error, peer, connectionId));
    socket.once('close', () => {
      frames.flush();
      sockets.delete(socket);
    });
  });

  const managed = Object.assign(server, {
    closeConnections: () => {
      for (const [socket, flush] of sockets) {
        // net.Server may emit close before each Socket close listener runs.
        // Flush synchronously so gateway shutdown can await these receipts.
        flush();
        socket.destroy();
      }
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, () => resolve(managed));
  });
}
