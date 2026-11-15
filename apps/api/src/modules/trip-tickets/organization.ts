import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';

/** Validate the complete proposed organization chain, including stored PATCH values. */
export async function assertTripOrganization(
  tx: Prisma.TransactionClient,
  refs: {
    branchId: string;
    officeId?: string | null;
    officeHeadId?: string | null;
  }
): Promise<void> {
  const [branch, office, head] = await Promise.all([
    tx.branch.findUnique({
      where: { id: refs.branchId },
      select: { id: true }
    }),
    refs.officeId
      ? tx.departmentOffice.findUnique({
          where: { id: refs.officeId },
          select: { branchId: true }
        })
      : null,
    refs.officeHeadId
      ? tx.officeHead.findUnique({
          where: { id: refs.officeHeadId },
          select: { branchId: true, officeId: true }
        })
      : null
  ]);
  if (!branch || (refs.officeId && !office) || (refs.officeHeadId && !head)) {
    throw new AppError(
      400,
      'INVALID_TRIP_ORGANIZATION',
      'Select an existing branch, office and office head'
    );
  }
  if (
    (office && office.branchId !== refs.branchId) ||
    (head && head.branchId !== refs.branchId)
  ) {
    throw new AppError(
      400,
      'INVALID_TRIP_ORGANIZATION',
      'Office and office head must belong to the selected branch'
    );
  }
  if (head && refs.officeId && head.officeId !== refs.officeId) {
    throw new AppError(
      400,
      'INVALID_TRIP_ORGANIZATION',
      'Office head must belong to the selected office'
    );
  }
}
