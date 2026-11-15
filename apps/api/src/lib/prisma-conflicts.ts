import { Prisma } from '@prisma/client';

/** Prisma 6 can surface PostgreSQL 18 RESTRICT failures without a P2003 code. */
export function isForeignKeyConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2003';
  }
  return (
    error instanceof Prisma.PrismaClientUnknownRequestError &&
    /\bcode:\s*"(?:23001|23503)"/.test(error.message) &&
    /violates (?:RESTRICT setting of )?foreign key constraint/i.test(
      error.message
    )
  );
}

/** Constraint names are used internally to choose a safe domain message. */
export function foreignKeyConstraintName(error: unknown): string | null {
  if (!isForeignKeyConflict(error)) return null;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const field = error.meta?.constraint ?? error.meta?.field_name;
    return typeof field === 'string'
      ? field.replace(/\s+\(index\)$/, '')
      : null;
  }
  const message = (error as Error).message.replace(/\\"/g, '"');
  return /foreign key constraint "([a-zA-Z0-9_]+)"/i.exec(message)?.[1] ?? null;
}
