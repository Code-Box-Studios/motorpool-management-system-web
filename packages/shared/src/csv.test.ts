import { describe, expect, it } from 'vitest';
import { encodeCsv, parseCsv } from './csv.js';

describe('CSV interchange', () => {
  it('parses BOM, commas, escaped quotes, CRLF, Unicode and multiline fields', () => {
    expect(
      parseCsv('\uFEFFname,notes\r\n"José, Jr.","He said ""yes""\r\nNext"\r\n')
    ).toEqual([
      ['name', 'notes'],
      ['José, Jr.', 'He said "yes"\r\nNext']
    ]);
  });
  it('neutralizes spreadsheet formulas and preserves text on reimport', () => {
    const values = [
      '=1+1',
      '+639123456789',
      '-12',
      '@SUM(A1)',
      '\t=1',
      '  =1',
      "'literal",
      "'+63",
      'ordinary'
    ];
    const output = encodeCsv(
      ['value'],
      values.map((value) => [value])
    );
    expect(output).toContain("'+639123456789");
    expect(output).toContain("''literal");
    expect(parseCsv(output)).toEqual([
      ['value'],
      ...values.map((value) => [value])
    ]);
  });
  it('encodes empty cells, numbers and punctuation with consistent CRLF rows', () => {
    expect(
      encodeCsv(
        ['a', 'b'],
        [
          [null, 4],
          ['a,"b"', undefined]
        ]
      )
    ).toBe('a,b\r\n,4\r\n"a,""b""",\r\n');
  });
  it.each(['a\n"unfinished', 'a\nun"quoted', 'a\n"closed"tail'])(
    'rejects malformed quoting: %s',
    (csv) => {
      expect(() => parseCsv(csv)).toThrow();
    }
  );
});
