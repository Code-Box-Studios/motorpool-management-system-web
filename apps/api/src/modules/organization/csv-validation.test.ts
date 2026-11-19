import { describe, expect, it } from 'vitest';
import { validateOrganizationCsv } from './csv-validation.js';

const branch = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Main',
  archivedAt: null
};
const other = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'North',
  archivedAt: null
};
const office = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Ops',
  branchId: branch.id,
  archivedAt: null
};
const id = '44444444-4444-4444-8444-444444444444';
const context = {
  branches: [branch, other],
  offices: [office],
  records: [{ id, archivedAt: null }]
};
const headers = 'id,name,position,phone,branch_id,branch_name,archived_at\r\n';

describe('organization CSV validation', () => {
  it('creates duplicate names and updates only by ID', () => {
    const result = validateOrganizationCsv(
      'employees',
      headers + `,Ana,Clerk,+63912,,Main,\r\n${id},Ana,,,,Main,`,
      context
    );
    expect(result.errors).toEqual([]);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.rows[0]!.data).toEqual({
      name: 'Ana',
      position: 'Clerk',
      phone: '+63912',
      branchId: branch.id
    });
  });
  it.each([
    [`,Ana,,,${branch.id},North,`, 'branch'],
    [`,Ana,,,,Missing,`, 'branch'],
    [`${id},Ana,,,,Main,\r\n${id},Other,,,,Main,`, 'Duplicate'],
    [`,Ana,,,,Main,2026-10-25T00:00:00Z`, 'archive'],
    [`,,,,,Main,`, 'name']
  ])('rejects invalid input with row numbers', (body, message) => {
    const result = validateOrganizationCsv(
      'employees',
      headers + body,
      context
    );
    expect(
      result.errors.some(
        (error) =>
          error.row >= 2 &&
          error.message.toLowerCase().includes(message.toLowerCase())
      )
    ).toBe(true);
  });
  it('rejects ambiguous names and archived references', () => {
    const ambiguous = validateOrganizationCsv(
      'employees',
      headers + ',Ana,,,,Main,',
      { ...context, branches: [branch, { ...other, name: 'Main' }] }
    );
    expect(ambiguous.errors[0]!.message).toMatch(/ambiguous/i);
    const archived = validateOrganizationCsv(
      'employees',
      headers + `,Ana,,,${branch.id},,`,
      { ...context, branches: [{ ...branch, archivedAt: new Date() }] }
    );
    expect(archived.errors[0]!.message).toMatch(/active/i);
  });
  it('rejects inconsistent branch and office pairs', () => {
    const result = validateOrganizationCsv(
      'office-heads',
      `id,name,branch_id,branch_name,office_id,office_name,archived_at\n,Ana,${other.id},,${office.id},,`,
      context
    );
    expect(result.errors[0]!.message).toMatch(/branch/i);
  });
  it('preserves an unchanged archived timestamp but rejects archive state changes', () => {
    const archivedAt = new Date('2026-10-01T00:00:00Z');
    const ctx = { ...context, records: [{ id, archivedAt }] };
    expect(
      validateOrganizationCsv(
        'employees',
        headers + `${id},Ana,,,,Main,${archivedAt.toISOString()}`,
        ctx
      ).errors
    ).toEqual([]);
    expect(
      validateOrganizationCsv('employees', headers + `${id},Ana,,,,Main,`, ctx)
        .errors[0]!.message
    ).toMatch(/archive/i);
  });
  it('rejects files beyond the row or byte limit', () => {
    expect(
      validateOrganizationCsv(
        'employees',
        headers + ',Ana,,,,Main,\n'.repeat(1001),
        context
      ).errors[0]!.message
    ).toMatch(/1,000/);
    expect(
      validateOrganizationCsv('employees', 'é'.repeat(262145), context)
        .errors[0]!.message
    ).toMatch(/512/);
  });
});

describe('organization CSV round trips', () => {
  const archivedAt = new Date('2026-10-01T00:00:00Z');
  const closedBranch = {
    id: '55555555-5555-4555-8555-555555555555',
    name: 'Closed',
    archivedAt
  };

  it('keeps an archived record on its archived branch when the export comes back unchanged', () => {
    const result = validateOrganizationCsv(
      'employees',
      headers +
        `${id},Ana,,,${closedBranch.id},Closed,${archivedAt.toISOString()}`,
      {
        ...context,
        branches: [branch, closedBranch],
        records: [{ id, archivedAt, branchId: closedBranch.id }]
      }
    );
    expect(result.errors).toEqual([]);
    expect(result.rows[0]!.data.branchId).toBe(closedBranch.id);
  });

  it('still refuses to move a record onto an archived branch', () => {
    const result = validateOrganizationCsv(
      'employees',
      headers + `${id},Ana,,,${closedBranch.id},Closed,`,
      {
        ...context,
        branches: [branch, closedBranch],
        records: [{ id, archivedAt: null, branchId: branch.id }]
      }
    );
    expect(result.errors[0]!.message).toMatch(/active/i);
  });

  it('keeps an archived office head on its archived office when unchanged', () => {
    const closedOffice = {
      ...office,
      id: '66666666-6666-4666-8666-666666666666',
      name: 'Old Ops',
      archivedAt
    };
    const result = validateOrganizationCsv(
      'office-heads',
      `id,name,branch_id,branch_name,office_id,office_name,archived_at\n${id},Ana,${branch.id},Main,${closedOffice.id},Old Ops,${archivedAt.toISOString()}`,
      {
        ...context,
        offices: [office, closedOffice],
        records: [
          { id, archivedAt, branchId: branch.id, officeId: closedOffice.id }
        ]
      }
    );
    expect(result.errors).toEqual([]);
    expect(result.rows[0]!.data.officeId).toBe(closedOffice.id);
  });

  it('trims names and optional text the way the record form does', () => {
    const result = validateOrganizationCsv(
      'employees',
      headers + `,  Ana Cruz  ,   ,  +63912  ,,Main,`,
      context
    );
    expect(result.errors).toEqual([]);
    expect(result.rows[0]!.data).toEqual({
      name: 'Ana Cruz',
      position: null,
      phone: '+63912',
      branchId: branch.id
    });
  });
});

describe('organization CSV branches', () => {
  const branchHeaders = 'id,name,location,archived_at\n';
  const branchContext = { ...context, records: [branch, other] };

  it('creates and updates branches with trimmed names and locations', () => {
    const result = validateOrganizationCsv(
      'branches',
      branchHeaders +
        `,  South  ,  Davao  ,\n${branch.id},Main Campus,,\n${other.id},north,,`,
      branchContext
    );
    expect(result.errors).toEqual([]);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(2);
    expect(result.rows.map((row) => row.data)).toEqual([
      { name: 'South', location: 'Davao' },
      { name: 'Main Campus', location: null },
      { name: 'north', location: null }
    ]);
  });

  it.each([
    [',north,,', 'existing branch'],
    [',South,,\n,SOUTH,,', 'in-file duplicate'],
    [`${branch.id},North,,`, 'rename onto another branch'],
    [`,Closed,,`, 'name held by an archived branch']
  ])('rejects a duplicate branch name (%s: %s)', (body) => {
    const result = validateOrganizationCsv('branches', branchHeaders + body, {
      ...branchContext,
      branches: [
        branch,
        other,
        { id: 'x', name: 'Closed', archivedAt: new Date() }
      ],
      records: [branch, other]
    });
    expect(result.errors.at(-1)!.message).toMatch(/already exists/i);
  });
});

describe('organization CSV offices', () => {
  const officeHeaders =
    'id,name,branch_id,branch_name,head_id,head_name,archived_at\n';
  const head = {
    id: '77777777-7777-4777-8777-777777777777',
    name: 'Chief',
    archivedAt: null,
    branchId: branch.id,
    officeId: office.id
  };
  const officeContext = { ...context, heads: [head], records: [office] };

  it('creates offices with the branch and head resolved by name', () => {
    const result = validateOrganizationCsv(
      'offices',
      officeHeaders + `,  Records  ,,Main,,Chief,\n,Ops,,North,,,`,
      officeContext
    );
    expect(result.errors).toEqual([]);
    expect(result.rows.map((row) => row.data)).toEqual([
      { name: 'Records', branchId: branch.id, headId: head.id },
      { name: 'Ops', branchId: other.id, headId: null }
    ]);
  });

  it.each([
    [',ops,,Main,,,', /already exists/i],
    [',Records,,Main,,Missing,', /head/i],
    [`${office.id},Ops,${other.id},North,,,`, /office heads/i]
  ])('rejects an invalid office row (%s)', (body, message) => {
    const result = validateOrganizationCsv(
      'offices',
      officeHeaders + body,
      officeContext
    );
    expect(result.errors[0]!.message).toMatch(message);
  });

  it('asks for an ID when two office heads share a name', () => {
    const result = validateOrganizationCsv(
      'offices',
      officeHeaders + ',Records,,Main,,Chief,',
      {
        ...officeContext,
        heads: [head, { ...head, id: '88888888-8888-4888-8888-888888888888' }]
      }
    );
    expect(result.errors[0]!.message).toMatch(/ambiguous/i);
  });
});
