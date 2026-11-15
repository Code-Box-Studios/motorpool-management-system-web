import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  foreignKeyConstraintName,
  isForeignKeyConflict
} from './prisma-conflicts.js';

describe('Prisma foreign-key conflict classification', () => {
  const restrictMessage =
    'ConnectorError(QueryError(PostgresError { code: "23001", message: "update or delete on table \\"drivers\\" violates RESTRICT setting of foreign key constraint \\"tool_borrows_borrower_id_fkey\\" on table \\"tool_borrows\\"" }))';
  it('recognizes Prisma PostgreSQL 18 RESTRICT failures and extracts the constraint', () => {
    const error = new Prisma.PrismaClientUnknownRequestError(restrictMessage, {
      clientVersion: '6.19.3'
    });
    expect(isForeignKeyConflict(error)).toBe(true);
    expect(foreignKeyConstraintName(error)).toBe(
      'tool_borrows_borrower_id_fkey'
    );
  });
  it('retains known P2003 handling', () => {
    const error = new Prisma.PrismaClientKnownRequestError('FK conflict', {
      code: 'P2003',
      clientVersion: '6.19.3',
      meta: { field_name: 'trip_tickets_driver_id_fkey (index)' }
    });
    expect(isForeignKeyConflict(error)).toBe(true);
    expect(foreignKeyConstraintName(error)).toBe('trip_tickets_driver_id_fkey');
  });
  it.each([
    new Error(restrictMessage),
    new Prisma.PrismaClientUnknownRequestError(
      'PostgresError { code: "23001", message: "unrelated restriction" }',
      { clientVersion: '6.19.3' }
    ),
    new Prisma.PrismaClientUnknownRequestError(
      'PostgresError { code: "08006", message: "connection lost" }',
      { clientVersion: '6.19.3' }
    )
  ])('does not disguise unrelated failures as conflicts', (error) => {
    expect(isForeignKeyConflict(error)).toBe(false);
    expect(foreignKeyConstraintName(error)).toBeNull();
  });
});
