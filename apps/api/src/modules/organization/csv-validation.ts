import {
  parseCsv,
  ORGANIZATION_CSV_HEADERS,
  ORGANIZATION_CSV_MAX_BYTES,
  ORGANIZATION_CSV_MAX_ROWS,
  type OrganizationCsvResource
} from '@mms/shared';

interface Reference {
  id: string;
  name: string;
  archivedAt: Date | null;
  branchId?: string | null;
  officeId?: string | null;
}
// The row an ID updates. Its current links let an exported archived record
// come back unchanged even when the branch, office or head it points at has
// since closed.
interface ExistingRecord {
  id: string;
  archivedAt: Date | null;
  branchId?: string | null;
  officeId?: string | null;
  headId?: string | null;
}
export interface CsvContext {
  branches: Reference[];
  offices: Reference[];
  heads?: Reference[];
  records: ExistingRecord[];
}
export interface ValidatedCsvRow {
  row: number;
  id: string | null;
  data: {
    name: string;
    branchId?: string | null;
    officeId?: string | null;
    headId?: string | null;
    position?: string | null;
    phone?: string | null;
    location?: string | null;
  };
}

export function validateOrganizationCsv(
  resource: OrganizationCsvResource,
  csv: string,
  context: CsvContext
) {
  const errors: { row: number; message: string }[] = [];
  const rows: ValidatedCsvRow[] = [];
  const result = () => ({
    errors,
    rows,
    created: rows.filter((r) => !r.id).length,
    updated: rows.filter((r) => r.id).length
  });
  const reject = (row: number, message: string) =>
    errors.push({ row, message });
  if (Buffer.byteLength(csv, 'utf8') > ORGANIZATION_CSV_MAX_BYTES) {
    reject(1, 'File exceeds 512 KiB limit');
    return result();
  }
  let table: string[][];
  try {
    table = parseCsv(csv);
  } catch (error) {
    reject(1, (error as Error).message);
    return result();
  }
  const headers = table.shift() ?? [];
  const expected = ORGANIZATION_CSV_HEADERS[resource];
  if (
    headers.length !== expected.length ||
    new Set(headers).size !== headers.length ||
    expected.some((h) => !headers.includes(h))
  ) {
    reject(1, `Expected headers: ${expected.join(', ')}`);
    return result();
  }
  if (table.length > ORGANIZATION_CSV_MAX_ROWS) {
    reject(1, 'File exceeds 1,000 data rows');
    return result();
  }
  const seen = new Set<string>();
  // A new link must point at an active record. The record's CURRENT link is
  // also accepted when archived, so an unchanged export of an archived person
  // on a closed branch re-imports instead of failing the whole file.
  const resolve = (
    label: string,
    id: string,
    name: string,
    refs: Reference[],
    required: boolean,
    currentId?: string | null
  ): Reference | null => {
    if (!id && !name) {
      if (required) throw new Error(`${label} is required`);
      return null;
    }
    const candidates = refs.filter(
      (r) =>
        (!r.archivedAt || r.id === currentId) &&
        (id
          ? r.id === id
          : r.name.toLocaleLowerCase() === name.toLocaleLowerCase())
    );
    if (candidates.length !== 1)
      throw new Error(
        candidates.length > 1
          ? `${label} name is ambiguous; use its ID`
          : `${label} must reference an active record`
      );
    const ref = candidates[0]!;
    if (id && name && ref.name.toLocaleLowerCase() !== name.toLocaleLowerCase())
      throw new Error(`${label} ID and name do not match`);
    return ref;
  };
  // Names the database keeps unique (branches; offices within a branch),
  // archived rows included. A name stays claimed by its current owner for
  // the whole file, so rows can never collide part-way through the import.
  const claimed = new Map<string, string>();
  const nameKey = (name: string, scope = '') =>
    `${scope}\0${name.toLocaleLowerCase()}`;
  if (resource === 'branches')
    for (const b of context.branches) claimed.set(nameKey(b.name), b.id);
  if (resource === 'offices')
    for (const o of context.offices)
      claimed.set(nameKey(o.name, o.branchId ?? ''), o.id);
  const claim = (key: string, owner: string, message: string) => {
    const holder = claimed.get(key);
    if (holder !== undefined && holder !== owner) throw new Error(message);
    claimed.set(key, owner);
  };
  table.forEach((cells, index) => {
    const row = index + 2;
    if (cells.every((c) => c === '')) return;
    try {
      if (cells.length !== headers.length)
        throw new Error(`Expected ${headers.length} cells`);
      const raw = (key: string) => cells[headers.indexOf(key)] ?? '';
      if (cells.some((value) => value.includes('\0')))
        throw new Error('NUL characters are not supported');
      // Trimmed like the record form, so an import never stores padding the
      // form would have removed. Optional text left blank becomes null.
      const text = (key: string) => raw(key).trim();
      const optional = (key: string) => text(key) || null;
      const id = text('id') || null;
      if (id && seen.has(id)) throw new Error('Duplicate ID in file');
      if (id) seen.add(id);
      const existing = id
        ? context.records.find((r) => r.id === id)
        : undefined;
      if (id && !existing)
        throw new Error(
          'ID does not identify an existing record in this resource'
        );
      const name = text('name');
      if (!name) throw new Error('name is required');
      if (raw('archived_at') !== (existing?.archivedAt?.toISOString() ?? ''))
        throw new Error(
          'archived_at cannot change archive state; use Archive or Restore'
        );
      const owner = id ?? `row ${row}`;
      let data: ValidatedCsvRow['data'];
      if (resource === 'branches') {
        claim(nameKey(name), owner, `A branch named "${name}" already exists`);
        data = { name, location: optional('location') };
      } else {
        const branch = resolve(
          'branch',
          text('branch_id'),
          text('branch_name'),
          context.branches,
          resource === 'employees',
          existing?.branchId
        );
        const branchId = branch?.id ?? null;
        if (resource === 'employees') {
          data = {
            name,
            branchId,
            position: optional('position'),
            phone: optional('phone')
          };
        } else if (resource === 'office-heads') {
          const office = resolve(
            'office in selected branch',
            text('office_id'),
            text('office_name'),
            context.offices.filter((o) => !branch || o.branchId === branch.id),
            false,
            existing?.officeId
          );
          if (office && (office.branchId ?? null) !== branchId)
            throw new Error('office and branch do not match');
          data = { name, branchId, officeId: office?.id ?? null };
        } else {
          const head = resolve(
            'head',
            text('head_id'),
            text('head_name'),
            context.heads ?? [],
            false,
            existing?.headId
          );
          // Same rule as a manual office edit: heads attached to the office
          // must not be left in a different branch.
          const officeId = existing?.id;
          if (
            officeId &&
            branchId !== (existing?.branchId ?? null) &&
            (context.heads ?? []).some(
              (h) =>
                h.officeId === officeId && (h.branchId ?? null) !== branchId
            )
          )
            throw new Error(
              'Move or clear the attached office heads before changing this office branch'
            );
          claim(
            nameKey(name, branchId ?? ''),
            owner,
            `An office named "${name}" already exists in this branch`
          );
          data = { name, branchId, headId: head?.id ?? null };
        }
      }
      rows.push({ row, id, data });
    } catch (error) {
      reject(row, (error as Error).message);
    }
  });
  if (!table.some((row) => row.some((cell) => cell !== '')))
    reject(2, 'File has no data rows');
  return result();
}
