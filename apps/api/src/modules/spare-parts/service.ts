import { sparePartSearch } from '../../lib/list-search.js';
import type {
  CreateSparePartBody,
  SparePartsListQuery,
  UpdateSparePartBody
} from '@mms/shared';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { toOrderBy } from '../../lib/sorting.js';
import { prisma } from '../../lib/prisma.js';
import { lockSpareParts } from '../../lib/resource-locks.js';
import { findSparePartById, listSpareParts } from './repository.js';

export async function list(query: SparePartsListQuery) {
  // Match the stock badges: zero is empty, one through five is low.
  const stockWhere: Record<
    NonNullable<SparePartsListQuery['stock']>,
    Prisma.SparePartWhereInput
  > = {
    in_stock: { quantity: { gt: 5 } },
    low_stock: { quantity: { gt: 0, lte: 5 } },
    out_of_stock: { quantity: 0 }
  };
  const orderBy = toOrderBy<Prisma.SparePartOrderByWithRelationInput>(
    query.sortBy,
    query.sortOrder,
    {
      name: (order) => ({ name: order }),
      brand: (order) => ({ brand: order }),
      quantity: (order) => ({ quantity: order }),
      description: (order) => ({ description: order })
    },
    { updatedAt: 'desc' }
  );
  return listSpareParts(toSkipTake(query), orderBy, {
    ...sparePartSearch(query.search),
    ...(query.stock ? stockWhere[query.stock] : {})
  });
}

export async function getById(id: string) {
  const part = await findSparePartById(id);
  if (!part) throw new AppError(404, 'NOT_FOUND', 'Spare part not found');
  return part;
}

export async function create(
  body: CreateSparePartBody,
  imagePath: string | null
) {
  return prisma.sparePart.create({ data: { ...body, image: imagePath } });
}

export async function update(
  id: string,
  body: UpdateSparePartBody,
  newImagePath: string | null
) {
  const { removeImage, expectedUpdatedAt, ...rest } = body;
  // Image field: a new upload wins; else removeImage clears it; else untouched.
  const image = newImagePath ? newImagePath : removeImage ? null : undefined;
  return prisma.$transaction(async (tx) => {
    await lockSpareParts(tx, [id]);
    const existing = await tx.sparePart.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Spare part not found');
    if (
      rest.quantity !== undefined &&
      (!expectedUpdatedAt ||
        new Date(expectedUpdatedAt).getTime() !== existing.updatedAt.getTime())
    ) {
      throw new AppError(
        409,
        'STOCK_REVISION_CONFLICT',
        'Stock changed. Refresh this spare part before adjusting its quantity.'
      );
    }
    return tx.sparePart.update({
      where: { id },
      data: {
        ...rest,
        ...(image !== undefined ? { image } : {}),
        // Date revisions must advance even for two writes within one millisecond.
        updatedAt: new Date(
          Math.max(Date.now(), existing.updatedAt.getTime() + 1)
        )
      }
    });
  });
}

export async function remove(id: string): Promise<void> {
  const existing = await findSparePartById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Spare part not found');
  await prisma.sparePart.delete({ where: { id } });
}
