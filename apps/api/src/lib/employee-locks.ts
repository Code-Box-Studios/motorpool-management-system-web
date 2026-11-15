import { Prisma } from '@prisma/client';

/** Membership writers and archival use the same ordered employee locks. */
export async function lockEmployees(
  tx: Prisma.TransactionClient,
  ids: string[]
): Promise<void> {
  if (!ids.length) return;
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM employees
    WHERE id IN (${Prisma.join([...new Set(ids)].map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY id FOR NO KEY UPDATE
  `);
}
