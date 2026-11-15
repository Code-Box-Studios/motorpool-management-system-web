import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { truncateAll } from '../../test/db.js';
import {
  createTestBranch,
  createTestUser,
  createTestVehicle
} from '../../test/factories.js';
import { holdRow, waitForLockWaiter } from '../../test/lock-barrier.js';
import { update } from './service.js';

describe('concurrent vehicle image edits', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  // Reading images before the shared vehicle lock loses a successful addition
  // or revives a successful removal. The literal final collection catches both.
  it.each(['add', 'remove'] as const)(
    'preserves an accepted %s while a second edit waits',
    async (firstAction) => {
      const branch = await createTestBranch();
      const vehicle = await createTestVehicle(branch.id);
      const { user } = await createTestUser();
      const actor = { ...user, role: 'admin', branchId: null };
      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { images: ['/original.png'] }
      });
      const barrier = await holdRow(
        (tx) =>
          tx.$queryRaw`SELECT id FROM vehicles WHERE id = ${vehicle.id}::uuid FOR NO KEY UPDATE`
      );
      const edits: ReturnType<typeof update>[] = [];
      try {
        edits.push(
          update(
            vehicle.id,
            firstAction === 'remove'
              ? { removedImages: ['/original.png'] }
              : {},
            firstAction === 'add' ? ['/first.png'] : [],
            actor
          )
        );
        const firstPid = await waitForLockWaiter(barrier.pid);
        edits.push(update(vehicle.id, {}, ['/second.png'], actor));
        await waitForLockWaiter(barrier.pid, firstPid);
      } finally {
        barrier.release();
        await barrier.task;
        await Promise.allSettled(edits);
      }
      await expect(Promise.all(edits)).resolves.toHaveLength(2);
      const final = await prisma.vehicle.findUniqueOrThrow({
        where: { id: vehicle.id }
      });
      expect(final.images).toEqual(
        firstAction === 'add'
          ? ['/original.png', '/first.png', '/second.png']
          : ['/second.png']
      );
    }
  );
});
