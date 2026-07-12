import 'dotenv/config';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

// Raw TCP logger. No decoding — this exists to capture EXACTLY what a real
// ST-901 puts on the wire, so the H02 decoder can be locked to reality.
const port = Number(process.env.GATEWAY_TCP_PORT ?? 5013);
const dir = path.resolve('captures');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `capture-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
const out = fs.createWriteStream(file, { flags: 'a' });

function write(line: string): void {
  process.stdout.write(`${line}\n`);
  out.write(`${line}\n`);
}

// Printable ASCII, with non-printables shown as '.', alongside the hex.
function render(chunk: Buffer): string {
  const hex = chunk.toString('hex').replace(/(.{2})/g, '$1 ').trim();
  const ascii = Array.from(chunk, (b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.')).join('');
  return `  hex   : ${hex}\n  ascii : ${ascii}`;
}

net
  .createServer((socket) => {
    const peer = `${socket.remoteAddress}:${socket.remotePort}`;
    write(`[${new Date().toISOString()}] CONNECT ${peer}`);
    socket.on('data', (chunk: Buffer) => {
      write(`[${new Date().toISOString()}] DATA ${peer} (${chunk.length} bytes)`);
      write(render(chunk));
    });
    socket.on('close', () => write(`[${new Date().toISOString()}] CLOSE ${peer}`));
    socket.on('error', (err) => write(`[${new Date().toISOString()}] ERROR ${peer}: ${err.message}`));
  })
  .listen(port, () => write(`capture listening on :${port} — writing to ${file}`));
