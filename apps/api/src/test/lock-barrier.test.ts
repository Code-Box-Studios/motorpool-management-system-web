import type { Prisma } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const faults = vi.hoisted(() => ({
  query: null as Error | null,
  commit: null as Error | null
}));

// Connection/PID-query and commit failures must be deterministic without
// terminating a real database connection used by concurrent suites. Keep the
// callback's asynchronous lock/release behavior and the original task promise.
vi.mock('../lib/prisma.js', () => ({
  prisma: {
    $transaction(work: (tx: Prisma.TransactionClient) => Promise<void>) {
      const task = Promise.resolve()
        .then(() =>
          work({
            $queryRaw: async () => {
              if (faults.query) throw faults.query;
              return [{ pid: 123 }];
            }
          } as unknown as Prisma.TransactionClient)
        )
        .then(() => {
          if (faults.commit) throw faults.commit;
        });
      // Observe injected transaction failures even against the unfixed helper;
      // the helper must still forward them to its caller's readiness promise.
      void task.catch(() => {});
      return task;
    }
  }
}));

import { holdRow } from './lock-barrier.js';

async function readinessOutcome(pending: ReturnType<typeof holdRow>) {
  return Promise.race([
    pending.then(
      () => ({ state: 'ready' as const }),
      (error: unknown) => ({ state: 'rejected' as const, error })
    ),
    new Promise<{ state: 'pending' }>((resolve) => {
      setTimeout(() => resolve({ state: 'pending' }), 100);
    })
  ]);
}

describe('database row barrier failure propagation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    faults.query = null;
    faults.commit = null;
  });
  afterEach(() => vi.useRealTimers());

  it('rejects readiness when the requested row lock fails', async () => {
    const error = new Error('Row lock failed');
    const outcome = readinessOutcome(
      holdRow(async () => {
        throw error;
      })
    );
    await vi.runAllTimersAsync();
    expect(await outcome).toEqual({ state: 'rejected', error });
  });

  it('rejects readiness when the backend PID query fails', async () => {
    const error = new Error('Backend connection failed');
    faults.query = error;
    const outcome = readinessOutcome(holdRow(async () => {}));
    await vi.runAllTimersAsync();
    expect(await outcome).toEqual({ state: 'rejected', error });
  });

  it('preserves the original task rejection after readiness succeeds', async () => {
    const error = new Error('Commit failed');
    faults.commit = error;
    const barrier = await holdRow(async () => {});
    expect(barrier.pid).toBe(123);
    barrier.release();
    await expect(barrier.task).rejects.toBe(error);
  });
});
