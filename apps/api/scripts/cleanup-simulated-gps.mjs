import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { classifySimulatedGpsPoint } from './simulated-gps.mjs';

const { values } = parseArgs({
  options: {
    before: { type: 'string' },
    apply: { type: 'boolean', default: false },
    backup: { type: 'string' },
    help: { type: 'boolean', default: false }
  }
});

if (values.help) {
  console.log(
    'Usage: node scripts/cleanup-simulated-gps.mjs --before <UTC ISO timestamp> [--apply --backup <new JSON path>]'
  );
  console.log(
    'Dry run by default. Matches only historical seed/browser/TCP simulator fingerprints.'
  );
  process.exit(0);
}
if (
  !values.before ||
  !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(values.before) ||
  !Number.isFinite(Date.parse(values.before))
) {
  throw new Error(
    '--before must be an explicit UTC ISO timestamp marking the start of real GPS data.'
  );
}
if (values.apply && !values.backup)
  throw new Error('--apply requires --backup <new JSON path>.');

const before = new Date(values.before);
const prisma = new PrismaClient();
try {
  const olderPoints = await prisma.gpsData.findMany({
    where: { createdAt: { lt: before } },
    orderBy: { id: 'asc' }
  });
  const candidates = olderPoints.filter((point) =>
    classifySimulatedGpsPoint(point, before)
  );
  const bySource = {};
  for (const point of candidates) {
    const source = classifySimulatedGpsPoint(point, before);
    bySource[source] = (bySource[source] ?? 0) + 1;
  }
  const database = new URL(process.env.DATABASE_URL);
  console.log(
    JSON.stringify(
      {
        mode: values.apply ? 'apply' : 'dry-run',
        database: `${database.hostname}${database.pathname}`,
        before: before.toISOString(),
        matched: candidates.length,
        bySource,
        unmatchedOlderPoints: olderPoints.length - candidates.length,
        protectedRecentPoints: await prisma.gpsData.count({
          where: { createdAt: { gte: before } }
        })
      },
      null,
      2
    )
  );

  if (values.apply && candidates.length) {
    const ids = candidates.map((point) => point.id);
    const vehicleIds = [
      ...new Set(candidates.map((point) => point.vehicleId).filter(Boolean))
    ].sort();
    const backupPath = resolve(values.backup);
    const deleted = await prisma.$transaction(
      async (tx) => {
        // Match the ingest transaction's vehicle boundary. New tracker readings
        // wait for this short cleanup, then update the vehicle normally.
        if (vehicleIds.length)
          await tx.$queryRaw`
        SELECT id FROM vehicles WHERE id IN (${Prisma.join(vehicleIds.map((id) => Prisma.sql`${id}::uuid`))})
        ORDER BY id FOR UPDATE
      `;
        await tx.$queryRaw`
        SELECT gps_id FROM gps_data WHERE gps_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
        ORDER BY gps_id FOR UPDATE
      `;
        const points = await tx.gpsData.findMany({
          where: { id: { in: ids } },
          orderBy: { id: 'asc' }
        });
        if (
          points.length !== candidates.length ||
          points.some((point) => !classifySimulatedGpsPoint(point, before))
        ) {
          throw new Error(
            'Selected history changed during inspection; nothing deleted. Run a fresh preview.'
          );
        }
        const vehicles = await tx.vehicle.findMany({
          where: { id: { in: vehicleIds } },
          select: {
            id: true,
            latitude: true,
            longitude: true,
            lastLocationUpdate: true
          }
        });
        // Exclusive creation prevents overwriting a previous backup. Flush the
        // private backup before any deletion, and roll back if writing fails.
        const backup = await open(backupPath, 'wx', 0o600);
        try {
          await backup.writeFile(
            JSON.stringify(
              { version: 1, createdAt: new Date(), before, points, vehicles },
              null,
              2
            )
          );
          await backup.sync();
        } finally {
          await backup.close();
        }
        const result = await tx.gpsData.deleteMany({
          where: { id: { in: ids }, createdAt: { lt: before } }
        });
        if (result.count !== ids.length)
          throw new Error(
            'History changed during deletion; transaction rolled back.'
          );
        for (const vehicleId of vehicleIds) {
          const latest = await tx.gpsData.findFirst({
            where: { vehicleId },
            orderBy: { createdAt: 'desc' }
          });
          await tx.vehicle.update({
            where: { id: vehicleId },
            data: {
              latitude: latest?.latitude ?? null,
              longitude: latest?.longitude ?? null,
              lastLocationUpdate: latest?.createdAt ?? null
            }
          });
        }
        return result.count;
      },
      { timeout: 15_000 }
    );
    console.log(
      JSON.stringify(
        {
          deleted,
          backupPath,
          remainingGpsPoints: await prisma.gpsData.count()
        },
        null,
        2
      )
    );
  } else {
    console.log(
      values.apply
        ? 'No matching simulated history; nothing changed.'
        : 'Preview only. No data changed.'
    );
  }
} finally {
  await prisma.$disconnect();
}
