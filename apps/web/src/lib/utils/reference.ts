// A short, human-readable reference for a record — so a UUID never reaches a
// screen. Deterministic and stable for a given record, but NOT sequential:
// the design calls for real running numbers (TT-2050), which needs a sequence
// column in the database. This keeps database keys off screen until then.
export function formatRef(
  prefix: string,
  id: string | null | undefined
): string {
  if (!id) return `${prefix}-—`;
  const tail = id.replace(/-/g, '').slice(-5).toUpperCase();
  return `${prefix}-${tail}`;
}
