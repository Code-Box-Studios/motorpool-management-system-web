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
        const [branches, offices, records] = await Promise.all([
          tx.branch.findMany({ orderBy: { id: 'asc' } }),
          tx.departmentOffice.findMany({ orderBy: { id: 'asc' } }),
          resource === 'employees'
            ? tx.employee.findMany({ orderBy: { id: 'asc' } })
            : tx.officeHead.findMany({ orderBy: { id: 'asc' } })
        ]);
        const validation = validateOrganizationCsv(resource, body.csv, {
          branches,
          offices,
          records
        });
        const previewToken = createHmac('sha256', config.jwtSecret)
          .update('organization-csv-v1\0')
          .update(
            JSON.stringify({
              resource,
              csv: body.csv,
              branches,
              offices,
              records
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
        for (const row of validation.rows) {
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
          } else {
            const data = {
              name: row.data.name,
              branchId: row.data.branchId,
              officeId: row.data.officeId
            };
            if (row.id)
              await tx.officeHead.update({ where: { id: row.id }, data });
            else await tx.officeHead.create({ data });
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
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
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
