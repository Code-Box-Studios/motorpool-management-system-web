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
}
export interface CsvContext {
  branches: Reference[];
  offices: Reference[];
  records: { id: string; archivedAt: Date | null }[];
}
export interface ValidatedCsvRow {
  row: number;
  id: string | null;
  data: {
    name: string;
    branchId: string | null;
    officeId?: string | null;
    position?: string | null;
    phone?: string | null;
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
  const resolve = (
    label: string,
    id: string,
    name: string,
    refs: Reference[],
    required: boolean
  ): Reference | null => {
    if (!id && !name) {
      if (required) throw new Error(`${label} is required`);
      return null;
    }
    const candidates = refs.filter(
      (r) =>
        !r.archivedAt &&
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
  table.forEach((cells, index) => {
    const row = index + 2;
    if (cells.every((c) => c === '')) return;
    try {
      if (cells.length !== headers.length)
        throw new Error(`Expected ${headers.length} cells`);
      const value = (key: string) => cells[headers.indexOf(key)] ?? '';
      const values = {
        id: value('id'),
        name: value('name'),
        position: value('position'),
        phone: value('phone'),
        branch_id: value('branch_id'),
        branch_name: value('branch_name'),
        office_id: value('office_id'),
        office_name: value('office_name'),
        archived_at: value('archived_at')
      };
      const id = values.id.trim() || null;
      if (id && seen.has(id)) throw new Error('Duplicate ID in file');
      if (id) seen.add(id);
      const existing = id
        ? context.records.find((r) => r.id === id)
        : undefined;
      if (id && !existing)
        throw new Error(
          'ID does not identify an existing record in this resource'
        );
      if (!values.name.trim()) throw new Error('name is required');
      if (Object.values(values).some((value) => value.includes('\0')))
        throw new Error('NUL characters are not supported');
      const timestamp = values.archived_at;
      if (timestamp !== (existing?.archivedAt?.toISOString() ?? ''))
        throw new Error(
          'archived_at cannot change archive state; use Archive or Restore'
        );
      const branch = resolve(
        'branch',
        values.branch_id.trim(),
        values.branch_name.trim(),
        context.branches,
        resource === 'employees'
      );
      const data: ValidatedCsvRow['data'] = {
        name: values.name,
        branchId: branch?.id ?? null
      };
      if (resource === 'employees') {
        data.position = values.position || null;
        data.phone = values.phone || null;
      } else {
        const office = resolve(
          'office in selected branch',
          values.office_id.trim(),
          values.office_name.trim(),
          context.offices.filter((o) => !branch || o.branchId === branch.id),
          false
        );
        if (office && (office.branchId ?? null) !== (branch?.id ?? null))
          throw new Error('office and branch do not match');
        data.officeId = office?.id ?? null;
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
