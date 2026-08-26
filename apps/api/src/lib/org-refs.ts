import { AppError } from './errors.js';
import { prisma } from './prisma.js';

export interface OrgRefs {
  branchId?: string | null;
  officeId?: string | null;
  officeHeadId?: string | null;
}

// No write may point a non-archived record at an archived parent (§5.6).
//
// This is what makes archiving real rather than a claim the UI makes. Removing
// archived rows from the list endpoints stops them being OFFERED; it does not
// stop them being SENT, and POST /api/trip-tickets is directly reachable.
//
// Only the keys actually present are checked, so a PATCH that does not touch
// branchId does not re-validate it — a record already pointing at a branch
// that was later archived stays exactly as it is.
export async function assertOrgRefsActive(refs: OrgRefs): Promise<void> {
  const checks: Promise<string | null>[] = [];

  if (refs.branchId) {
    checks.push(
      prisma.branch
        .findUnique({
          where: { id: refs.branchId },
          select: { archivedAt: true }
        })
        .then((r) => (r?.archivedAt ? 'branch' : null))
    );
  }
  if (refs.officeId) {
    checks.push(
      prisma.departmentOffice
        .findUnique({
          where: { id: refs.officeId },
          select: { archivedAt: true }
        })
        .then((r) => (r?.archivedAt ? 'department office' : null))
    );
  }
  if (refs.officeHeadId) {
    checks.push(
      prisma.officeHead
        .findUnique({
          where: { id: refs.officeHeadId },
          select: { archivedAt: true }
        })
        .then((r) => (r?.archivedAt ? 'office head' : null))
    );
  }

  const archived = (await Promise.all(checks)).filter(
    (v): v is string => v !== null
  );
  if (archived.length > 0) {
    throw new AppError(
      409,
      'PARENT_ARCHIVED',
      `Cannot reference an archived ${archived.join(' and ')}`
    );
  }
}
