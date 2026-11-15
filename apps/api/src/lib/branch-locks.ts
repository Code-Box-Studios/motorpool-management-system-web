import { Prisma } from '@prisma/client';

/** Keep parent activity stable until the relationship write commits. */
export async function lockBranches(
  tx: Prisma.TransactionClient,
  ids: string[]
): Promise<void> {
  if (!ids.length) return;
  // SHARE allows concurrent child writers but conflicts with archive's
  // NO KEY UPDATE. All multi-parent writes take the complete set in ID order.
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM branches
    WHERE id IN (${Prisma.join([...new Set(ids)].map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY id FOR SHARE
  `);
}
