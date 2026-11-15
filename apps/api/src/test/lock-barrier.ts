import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

/** Wait for a real database lock boundary, never a scheduler timing guess. */
export async function waitForLockWaiter(blockerPid: number, excludePid = 0) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<{ pid: number }[]>`
      SELECT pid FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'
        AND pid <> ${excludePid}
        AND (${blockerPid} = ANY(pg_blocking_pids(pid))
          OR ${excludePid} = ANY(pg_blocking_pids(pid)))
    `;
    if (rows[0]) return rows[0].pid;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Operation did not reach the expected PostgreSQL lock wait');
}

export async function holdRow(
  lock: (tx: Prisma.TransactionClient) => Promise<unknown>
) {
  let release!: () => void;
  let ready!: (pid: number) => void;
  let failed!: (reason: unknown) => void;
  const held = new Promise<number>((resolve, reject) => {
    ready = resolve;
    failed = reject;
  });
  const proceed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const task = prisma.$transaction(
    async (tx) => {
      await lock(tx);
      const [backend] = await tx.$queryRaw<
        { pid: number }[]
      >`SELECT pg_backend_pid() AS pid`;
      ready(backend!.pid);
      await proceed;
    },
    { timeout: 15000 }
  );
  // Setup failures must reject readiness. After readiness, this handler still
  // observes errors without replacing the original task returned to callers.
  void task.catch(failed);
  return { pid: await held, release, task };
}

/** A writer either waits behind archive or completes against the old code. */
export async function waitForWriterOrWaiter<T>(
  writer: Promise<T>,
  blockerPid: number,
  archivePid: number
) {
  let finished = false;
  void writer.then(
    () => {
      finished = true;
    },
    () => {
      finished = true;
    }
  );
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (finished) return;
    const rows = await prisma.$queryRaw<{ pid: number }[]>`
      SELECT pid FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'
        AND pid <> ${archivePid}
        AND (${blockerPid} = ANY(pg_blocking_pids(pid))
          OR ${archivePid} = ANY(pg_blocking_pids(pid)))
    `;
    if (rows.length) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Writer neither completed nor reached the archive lock');
}
