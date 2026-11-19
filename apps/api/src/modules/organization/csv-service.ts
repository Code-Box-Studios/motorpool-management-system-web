import { createHmac } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type {
  OrganizationCsvBody,
  OrganizationCsvPreview,
  OrganizationCsvResource
} from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { config } from '../../config.js';
import { prisma } from '../../lib/prisma.js';
import { lockBranches } from '../../lib/branch-locks.js';
import { assertOrgRefsActive } from '../../lib/org-refs.js';
import { validateOrganizationCsv } from './csv-validation.js';

// Tokens bind confirmation to the exact file and current organization snapshot.
// Domain separation keeps preview signatures distinct from authentication tokens.
// The shared server secret allows confirmation across restarts and API instances.

export async function organizationCsv(
  resource: OrganizationCsvResource,
  body: OrganizationCsvBody,
  confirm: boolean
): Promise<OrganizationCsvPreview> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const [branches, offices, heads, employees] = await Promise.all([
          tx.branch.findMany({ orderBy: { id: 'asc' } }),
          tx.departmentOffice.findMany({ orderBy: { id: 'asc' } }),
          tx.officeHead.findMany({ orderBy: { id: 'asc' } }),
          resource === 'employees'
            ? tx.employee.findMany({ orderBy: { id: 'asc' } })
            : Promise.resolve([])
        ]);
        const records: {
          id: string;
          archivedAt: Date | null;
          branchId?: string | null;
          officeId?: string | null;
          headId?: string | null;
        }[] =
          resource === 'employees'
            ? employees
            : resource === 'office-heads'
              ? heads
              : resource === 'branches'
                ? branches
                : offices;
        const validation = validateOrganizationCsv(resource, body.csv, {
          branches,
          offices,
          heads,
          records
        });
        const previewToken = createHmac('sha256', config.jwtSecret)
          .update('organization-csv-v2\0')
          .update(
            JSON.stringify({
              resource,
              csv: body.csv,
              branches,
              offices,
              heads,
              employees
            })
          )
          .digest('hex');
        const preview: OrganizationCsvPreview = {
          created: validation.created,
          updated: validation.updated,
          total: validation.rows.length,
          errors: validation.errors,
          previewToken,
          records: validation.rows.map((row) => ({
            row: row.row,
            action: row.id ? 'update' : 'create',
            name: row.data.name
          }))
        };
        if (!confirm) return preview;
        if (validation.errors.length)
          throw new AppError(
            400,
            'CSV_VALIDATION_ERROR',
            'CSV has validation errors; nothing imported',
            preview
          );
        if (!body.previewToken || body.previewToken !== previewToken)
          throw new AppError(
            409,
            'CSV_PREVIEW_STALE',
            'Organization data changed or preview is missing. Preview the file again.'
          );
        // Take the whole parent set in ID order before any row writes. A branch
        // archived since this serializable snapshot aborts as a stale preview.
        await lockBranches(
          tx,
          validation.rows.flatMap((row) =>
            row.data.branchId ? [row.data.branchId] : []
          )
        );
        const current = new Map(
          records.map((record) => [record.id, record] as const)
        );
        for (const row of validation.rows) {
          const before = row.id ? current.get(row.id) : undefined;
          // Re-check only links this row sets or changes. A record kept on the
          // branch, office or head it already had stays put even when that
          // parent has since been archived, like a manual edit that leaves the
          // link alone.
          const changed = <K extends 'branchId' | 'officeId' | 'headId'>(
            key: K
          ) =>
            row.data[key] !== undefined && row.data[key] !== before?.[key]
              ? row.data[key]
              : undefined;
          await assertOrgRefsActive(
            {
              branchId: changed('branchId'),
              officeId: changed('officeId'),
              officeHeadId: changed('headId')
            },
            tx
          );
          if (resource === 'employees') {
            const data = {
              name: row.data.name,
              branchId: row.data.branchId!,
              position: row.data.position,
              phone: row.data.phone
            };
            if (row.id)
              await tx.employee.update({ where: { id: row.id }, data });
            else await tx.employee.create({ data });
          } else if (resource === 'office-heads') {
            const data = {
              name: row.data.name,
              branchId: row.data.branchId,
              officeId: row.data.officeId
            };
            if (row.id)
              await tx.officeHead.update({ where: { id: row.id }, data });
            else await tx.officeHead.create({ data });
          } else if (resource === 'branches') {
            const data = { name: row.data.name, location: row.data.location };
            if (row.id) await tx.branch.update({ where: { id: row.id }, data });
            else await tx.branch.create({ data });
          } else {
            const data = {
              name: row.data.name,
              branchId: row.data.branchId,
              headId: row.data.headId
            };
            if (row.id)
              await tx.departmentOffice.update({ where: { id: row.id }, data });
            else await tx.departmentOffice.create({ data });
          }
        }
        return preview;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30_000
      }
    );
  } catch (error) {
    // A name taken by a concurrent writer surfaces as a unique violation
    // (P2002) rather than a serialization failure; both mean the preview is
    // stale and nothing was written.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2034' ||
        error.code === 'P2002' ||
        (error.code === 'P2010' && error.meta?.code === '40001'))
    ) {
      throw new AppError(
        409,
        'CSV_PREVIEW_STALE',
        'Organization data changed during import. Nothing imported; preview again.'
      );
    }
    throw error;
  }
}
