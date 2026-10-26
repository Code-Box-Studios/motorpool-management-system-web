import type { ReportResult } from '@mms/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { displayCell } from './format';
export function ReportTable({ report }: { report: ReportResult }) {
  return (
    <Table aria-label={report.title} className="min-w-[700px]">
      <TableHeader className="bg-muted/30">
        <TableRow>
          {report.columns.map((column) => (
            <TableHead
              key={column.key}
              scope="col"
              className="h-11 px-5 text-xs font-semibold"
            >
              {column.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {report.rows.length ? (
          report.rows.map((row, index) => (
            <TableRow key={index}>
              {report.columns.map((column) => (
                <TableCell
                  key={column.key}
                  className="max-w-80 px-5 py-3 align-top whitespace-normal tabular-nums"
                >
                  {displayCell(row[column.key])}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell
              colSpan={report.columns.length}
              className="text-muted-foreground py-12 text-center"
            >
              No matching records. Adjust the filters and generate again.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
