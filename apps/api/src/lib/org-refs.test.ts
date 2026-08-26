import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestBranch,
  createTestOffice,
  createTestOfficeHead
} from '../test/factories.js';
import { truncateAll } from '../test/db.js';
import { AppError } from './errors.js';
import { assertOrgRefsActive } from './org-refs.js';
import { prisma } from './prisma.js';

describe('assertOrgRefsActive', () => {
  beforeEach(truncateAll);
  afterAll(() => prisma.$disconnect());

  it('does not throw when every ref points at an active row', async () => {
    const branch = await createTestBranch();
    const office = await createTestOffice(branch.id);
    const head = await createTestOfficeHead(branch.id, office.id);
    await expect(
      assertOrgRefsActive({
        branchId: branch.id,
        officeId: office.id,
        officeHeadId: head.id
      })
    ).resolves.toBeUndefined();
  });

  // A missing row is a foreign-key problem, not an archived-parent one —
  // Prisma and each module's own NOT_FOUND check already handle it. Flip the
  // `r?.archivedAt ? '...' : null` in org-refs.ts to treat a null row as
  // archived and this fails.
  it('does not throw for a ref pointing at a row that does not exist', async () => {
    await expect(
      assertOrgRefsActive({
        branchId: '00000000-0000-0000-0000-000000000000'
      })
    ).resolves.toBeUndefined();
  });

  it('skips a ref that is explicitly null, rather than treating it as a violation', async () => {
    await expect(
      assertOrgRefsActive({
        branchId: null,
        officeId: null,
        officeHeadId: null
      })
    ).resolves.toBeUndefined();
  });

  it('throws PARENT_ARCHIVED when the referenced branch is archived', async () => {
    const branch = await createTestBranch();
    await prisma.branch.update({
      where: { id: branch.id },
      data: { archivedAt: new Date() }
    });

    let caught: unknown;
    try {
      await assertOrgRefsActive({ branchId: branch.id });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(AppError);
    const err = caught as AppError;
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('PARENT_ARCHIVED');
    expect(err.message).toBe('Cannot reference an archived branch');
  });

  it('throws PARENT_ARCHIVED when the referenced office is archived', async () => {
    const branch = await createTestBranch();
    const office = await createTestOffice(branch.id);
    await prisma.departmentOffice.update({
      where: { id: office.id },
      data: { archivedAt: new Date() }
    });

    await expect(assertOrgRefsActive({ officeId: office.id })).rejects.toThrow(
      AppError
    );
  });

  it('throws PARENT_ARCHIVED when the referenced office head is archived', async () => {
    const branch = await createTestBranch();
    const head = await createTestOfficeHead(branch.id);
    await prisma.officeHead.update({
      where: { id: head.id },
      data: { archivedAt: new Date() }
    });

    await expect(
      assertOrgRefsActive({ officeHeadId: head.id })
    ).rejects.toThrow(AppError);
  });

  // The message join at org-refs.ts:60 (`archived.join(' and ')`) is only
  // exercised when two+ refs are archived at once — a single-ref test can't
  // pin it.
  it('joins two archived parents into one message when both are archived at once', async () => {
    const branch = await createTestBranch();
    const office = await createTestOffice(branch.id);
    await prisma.branch.update({
      where: { id: branch.id },
      data: { archivedAt: new Date() }
    });
    await prisma.departmentOffice.update({
      where: { id: office.id },
      data: { archivedAt: new Date() }
    });

    let caught: unknown;
    try {
      await assertOrgRefsActive({ branchId: branch.id, officeId: office.id });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(AppError);
    const err = caught as AppError;
    expect(err.message).toBe(
      'Cannot reference an archived branch and department office'
    );
  });
});
