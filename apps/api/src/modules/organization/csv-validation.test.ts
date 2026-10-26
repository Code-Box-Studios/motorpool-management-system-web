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
