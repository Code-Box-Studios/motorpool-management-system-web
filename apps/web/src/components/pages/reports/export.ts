import { encodeCsv, type ReportResult, type ReportCell } from '@mms/shared';
import { toast } from 'sonner';
import { displayCell } from './format';

const stamp = (report: ReportResult) =>
  new Date(report.generatedAt).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila'
  });
const filterRows = (report: ReportResult): (string | number | null)[][] => [
  ['From', report.filters.from ?? 'Beginning'],
  ['To', report.filters.to ?? 'Present'],
  ['Branch', report.filters.branch ?? 'All'],
  ['Vehicle', report.filters.vehicle ?? 'All'],
  ['Status', report.filters.status ?? 'All'],
  ['Generated', `${stamp(report)} (Asia/Manila)`]
];
const fuelRows = (report: ReportResult): (string | number | null)[][] => {
  const fuel = report.fuel;
  if (!fuel) return [];
  return [
    ['Historical allocated fuel (L)', fuel.totalLiters],
    ['Historical GPS distance (km)', fuel.totalDistanceKm],
    ['Historical allocation rate (L/km)', fuel.rate],
    ['Trip ticket', fuel.selectedTrip?.reference ?? 'Unbooked estimate'],
    ['Origin', fuel.selectedTrip?.origin ?? null],
    ['Destination', fuel.selectedTrip?.destination ?? null],
    ['Planned route distance (km)', fuel.plannedDistanceKm],
    ['Proposed allocation (L)', fuel.proposedLiters],
    ['Estimated requirement (L)', fuel.estimate?.estimatedLiters ?? null],
    [
      'Difference, proposed minus estimate (L)',
      fuel.estimate?.difference ?? null
    ]
  ];
};
const recordRows = (report: ReportResult) =>
  report.rows.map((row) =>
    report.columns.map((column) => row[column.key] ?? null)
  );
const filename = (report: ReportResult, extension: string) =>
  `${report.type}-report-${report.generatedAt.slice(0, 10)}.${extension}`;
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadReportCsv(report: ReportResult) {
  const rows: (string | number | null)[][] = [
    ...filterRows(report),
    [],
    report.columns.map((column) => column.label),
    ...recordRows(report),
    [],
    ['Summary'],
    ...report.summary.map((item) => [item.label, item.value, item.unit ?? '']),
    ...fuelRows(report)
  ];
  if (report.fuel?.excluded.length)
    rows.push(
      [],
      ['Excluded ticket', 'Reason'],
      ...report.fuel.excluded.map((item) => [item.reference, item.reason])
    );
  rows.push([], ['Notes'], ...report.notes.map((note) => [note]));
  save(
    new Blob([encodeCsv([report.title], rows)], {
      type: 'text/csv;charset=utf-8'
    }),
    filename(report, 'csv')
  );
}
export async function downloadReportExcel(report: ReportResult) {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'Motorpool Management System';
  workbook.created = new Date(report.generatedAt);
  const records = workbook.addWorksheet('Records');
  records.addRow(report.columns.map((column) => column.label));
  records.addRows(recordRows(report));
  records.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  records.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF7A1730' }
  };
  records.columns.forEach((column) => {
    column.width = 24;
    column.alignment = { vertical: 'top', wrapText: true };
  });
  records.views = [{ state: 'frozen', ySplit: 1 }];
  if (report.columns.length)
    records.autoFilter = {
      from: { row: 1, column: 1 },
      to: {
        row: Math.max(1, report.rows.length + 1),
        column: report.columns.length
      }
    };
  records.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0
  };
  const summary = workbook.addWorksheet('Report details');
  summary.addRows([
    [report.title],
    ...filterRows(report),
    [],
    ['Summary'],
    ...report.summary.map((item) => [item.label, item.value, item.unit ?? '']),
    ...fuelRows(report),
    [],
    ['Notes'],
    ...report.notes.map((note) => [note])
  ]);
  summary.columns = [{ width: 52 }, { width: 38 }, { width: 20 }];
  summary.getRow(1).font = { bold: true, size: 16 };
  if (report.fuel?.excluded.length) {
    const sheet = workbook.addWorksheet('Excluded history');
    sheet.addRows([
      ['Trip ticket', 'Reason'],
      ...report.fuel.excluded.map((item) => [item.reference, item.reason])
    ]);
    sheet.columns = [{ width: 20 }, { width: 100 }];
  }
  const buffer = await workbook.xlsx.writeBuffer();
  save(
    new Blob([new Uint8Array(buffer)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }),
    filename(report, 'xlsx')
  );
}
const escape = (value: ReportCell | undefined) =>
  String(value ?? 'Not recorded').replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!
  );
export function printReport(report: ReportResult) {
  const popup = window.open('', '_blank');
  if (!popup) {
    toast.error('Allow pop-ups for this site to print the report.');
    return;
  }
  popup.opener = null;
  const simpleTable = (rows: (string | number | null)[][]) =>
    `<table><tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${escape(typeof value === 'number' ? displayCell(value) : value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  popup.document.write(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(report.title)}</title><style>@page{size:A4 landscape;margin:12mm}body{font:11px system-ui,sans-serif;color:#171717;margin:24px}h1{font-size:22px}h2{font-size:15px;margin-top:24px}table{width:100%;border-collapse:collapse;margin:12px 0;table-layout:auto}th,td{padding:7px;text-align:left;border:1px solid #d4d4d4;vertical-align:top;overflow-wrap:anywhere}th{background:#eee}thead{display:table-header-group}tr{break-inside:avoid}p{line-height:1.5}.summary{display:flex;flex-wrap:wrap;gap:24px;padding:14px;background:#f3f3f3}.muted{color:#555}@media print{body{margin:0}}</style></head><body><p>Motorpool Management System</p><h1>${escape(report.title)}</h1><p class="muted">${filterRows(
      report
    )
      .map(([label, value]) => `${escape(label)}: ${escape(value)}`)
      .join(
        ' · '
      )}</p><div class="summary">${report.summary.map((item) => `<div>${escape(item.label)}<br><strong>${escape(displayCell(item.value))} ${escape(item.unit ?? '')}</strong></div>`).join('')}</div><h2>${report.fuel ? 'Historical fuel allocation records' : 'Report records'}</h2><table><thead><tr>${report.columns.map((column) => `<th scope="col">${escape(column.label)}</th>`).join('')}</tr></thead><tbody>${report.rows.length ? report.rows.map((row) => `<tr>${report.columns.map((column) => `<td>${escape(displayCell(row[column.key]))}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${report.columns.length}">No matching records</td></tr>`}</tbody></table>${report.fuel ? `<h2>Fuel requirement for new trip</h2>${simpleTable(fuelRows(report))}<h2>Calculation</h2><p>Historical allocation rate = total allocated fuel ÷ total GPS distance.</p><p>Estimated fuel requirement = planned route distance × historical allocation rate.</p>${report.fuel.excluded.length ? `<h2>Excluded historical tickets</h2>${simpleTable(report.fuel.excluded.map((item) => [item.reference, item.reason]))}` : ''}` : ''}<h2>Notes</h2>${report.notes.map((note) => `<p>${escape(note)}</p>`).join('')}</body></html>`
  );
  popup.document.close();
  popup.focus();
  setTimeout(() => popup.print(), 250);
}
