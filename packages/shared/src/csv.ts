const spreadsheetFormula = /^(?:\s*[=+\-@]|[\t\r\n])/;

/**
 * Spreadsheet-safe RFC 4180 CSV. An apostrophe escapes formula-like strings;
 * existing leading apostrophes are doubled. parseCsv reverses this convention.
 */
export function encodeCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][]
): string {
  const cell = (value: string | number | null | undefined) => {
    let text = value == null ? '' : String(value);
    if (
      typeof value === 'string' &&
      (text.startsWith("'") || spreadsheetFormula.test(text))
    )
      text = "'" + text;
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return (
    [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') +
    '\r\n'
  );
}

/** Parse CSV and reverse encodeCsv's apostrophe escape without trimming text. */
export function parseCsv(input: string): string[][] {
  const source = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closed = false;
  const finishField = () => {
    if (
      field.startsWith("'") &&
      (field[1] === "'" || spreadsheetFormula.test(field.slice(1)))
    )
      field = field.slice(1);
    row.push(field);
    field = '';
    closed = false;
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += char;
    } else if (char === ',') finishField();
    else if (char === '\r' || char === '\n') {
      finishField();
      rows.push(row);
      row = [];
      if (char === '\r' && source[i + 1] === '\n') i++;
    } else if (char === '"' && field === '' && !closed) quoted = true;
    else {
      if (char === '"' || closed)
        throw new Error(`Invalid CSV quoting at character ${i + 1}`);
      field += char;
    }
  }
  if (quoted) throw new Error('Unterminated quoted CSV field');
  if (field !== '' || row.length > 0 || closed) {
    finishField();
    rows.push(row);
  }
  return rows;
}
