import type { FuelReportDetails } from '@mms/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { displayCell } from './format';
const n = (value: number | null | undefined, unit: string) =>
  value === null || value === undefined
    ? 'Unavailable'
    : `${displayCell(value)} ${unit}`;
export function FuelDetails({ fuel }: { fuel: FuelReportDetails }) {
  const estimate = fuel.estimate;
  const comparison =
    estimate?.difference === null || estimate?.difference === undefined
      ? 'Enter a proposed allocation to compare.'
      : Math.abs(estimate.difference) < 0.0000001
        ? 'Matches estimate'
        : `${n(Math.abs(estimate.difference), 'L')} ${estimate.difference > 0 ? 'above' : 'below'} estimate`;
  const rows = [
    ['Trip ticket', fuel.selectedTrip?.reference ?? 'Unbooked estimate'],
    ['Vehicle', fuel.vehicle],
    ['Origin', fuel.selectedTrip?.origin ?? 'Not recorded'],
    ['Destination', fuel.selectedTrip?.destination ?? 'Not selected'],
    ['Planned route distance', n(fuel.plannedDistanceKm, 'km')],
    ['Historical allocation rate', n(fuel.rate, 'L/km')],
    ['Estimated fuel requirement', n(estimate?.estimatedLiters, 'L')],
    ['Proposed fuel allocation', n(fuel.proposedLiters, 'L')],
    ['Difference', comparison]
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Fuel requirement for new trip</CardTitle>
            <Badge variant="outline">Estimated</Badge>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              {rows.map(([label, value]) => (
                <div
                  key={label}
                  className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 py-3 text-sm ${label === 'Estimated fuel requirement' ? 'text-primary font-semibold' : ''}`}
                >
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium break-words">{value}</dd>
                </div>
              ))}
            </dl>
            {!estimate && (
              <p role="status" className="bg-muted mt-4 rounded-lg p-3 text-sm">
                {fuel.rate === null
                  ? 'No eligible historical fuel/GPS data. An estimate cannot be calculated.'
                  : 'Enter a positive planned route distance and generate the report to calculate an estimate.'}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>How the estimate is calculated</CardTitle>
            <CardDescription>
              Use the totals across eligible completed tickets.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            <div className="bg-muted/60 rounded-xl p-4">
              <p className="font-semibold">1. Historical allocation rate</p>
              <p className="mt-2">Total allocated fuel ÷ total GPS distance</p>
              <p className="mt-3 font-mono">
                {n(fuel.totalLiters, 'L')} ÷ {n(fuel.totalDistanceKm, 'km')} ={' '}
                {n(fuel.rate, 'L/km')}
              </p>
            </div>
            <div className="bg-primary/5 rounded-xl p-4">
              <p className="font-semibold">2. Estimated fuel requirement</p>
              <p className="mt-2">
                Planned route distance × historical allocation rate
              </p>
              <p className="mt-3 font-mono">
                {n(fuel.plannedDistanceKm, 'km')} × {n(fuel.rate, 'L/km')} ={' '}
                {n(estimate?.estimatedLiters, 'L')}
              </p>
            </div>
            <p className="text-muted-foreground">
              This is an allocation reference. It does not represent verified
              actual fuel consumption.
            </p>
          </CardContent>
        </Card>
      </div>
      {fuel.excluded.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Excluded historical tickets ({fuel.excluded.length})
            </CardTitle>
            <CardDescription>
              These tickets do not affect the totals or estimate.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table aria-label="Excluded fuel history">
              <TableHeader>
                <TableRow>
                  <TableHead>Trip ticket</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fuel.excluded.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>{item.reference}</TableCell>
                    <TableCell className="whitespace-normal">
                      {item.reason}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
