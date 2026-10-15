import { Prisma } from '@prisma/client';

// Every trip operation locks drivers before vehicles. Within a resource type,
// lock IDs in sorted order so resource swaps cannot deadlock. IDs are not
// changed: NO KEY UPDATE still serializes claimers and status/mileage writes,
// while permitting foreign-key KEY SHARE checks (e.g. a repair mechanic).
export async function lockDrivers(tx: Prisma.TransactionClient, ids: string[]) {
  if (ids.length === 0) return;
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM drivers
    WHERE id IN (${Prisma.join([...new Set(ids)].map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY id FOR NO KEY UPDATE
  `);
}

export async function lockVehicles(
  tx: Prisma.TransactionClient,
  ids: string[]
) {
  if (ids.length === 0) return;
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM vehicles
    WHERE id IN (${Prisma.join([...new Set(ids)].map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY id FOR NO KEY UPDATE
  `);
}
