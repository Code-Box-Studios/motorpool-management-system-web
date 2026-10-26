import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  REPORT_TITLES,
  reportQuerySchema,
  type ReportQuery,
  type ReportType
} from '@mms/shared';
import {
  Download,
  FileSpreadsheet,
  Printer,
  Search,
  SlidersHorizontal,
  FileBarChart,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/page-header';
import { DatePicker } from '@/components/shared/date-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useBranchesForDisplay } from '@/lib/query/shared';
import { useAllVehicles } from '@/lib/query/vehicles';
import { useAllTripTickets } from '@/lib/query/trip-tickets';
import { getReport } from '@/lib/api/reports';
import { formatRef } from '@/lib/utils/reference';
import { FuelDetails } from './fuel-details';
import { displayCell } from './format';
import { ReportTable } from './report-table';
import { downloadReportCsv, downloadReportExcel, printReport } from './export';

interface Filters {
  type: ReportType;
  from: string;
  to: string;
  branchId: string;
  vehicleId: string;
  status: string;
  tripId: string;
  plannedDistanceKm: string;
  proposedLiters: string;
}
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
const asQuery = (form: Filters) => ({
  type: form.type,
  from: form.from || undefined,
  to: form.to || undefined,
  branchId: form.branchId || undefined,
  vehicleId: form.vehicleId || undefined,
  status: form.status || undefined,
  tripId: form.type === 'fuel' ? form.tripId || undefined : undefined,
  plannedDistanceKm:
    form.type === 'fuel' && form.plannedDistanceKm !== ''
      ? Number(form.plannedDistanceKm)
      : undefined,
  proposedLiters:
    form.type === 'fuel' && form.proposedLiters !== ''
      ? Number(form.proposedLiters)
      : undefined
});
const statuses: Partial<Record<ReportType, string[]>> = {
  trips: ['completed', 'scheduled', 'in_progress', 'cancelled'],
  odometer: ['in_progress', 'completed'],
  job_orders: ['pending', 'assigned_mechanic', 'ongoing_repair', 'repaired'],
  preventive: ['overdue', 'due_soon', 'pending', 'completed', 'unconfigured']
};
export default function ReportsPage() {
  const day = today();
  const [form, setForm] = useState<Filters>({
    type: 'trips',
    from: `${day.slice(0, 8)}01`,
    to: day,
    branchId: '',
    vehicleId: '',
    status: 'completed',
    tripId: '',
    plannedDistanceKm: '',
    proposedLiters: ''
  });
  const [generated, setGenerated] = useState<ReportQuery | null>(null);
  const [validation, setValidation] = useState('');
  const [exporting, setExporting] = useState(false);
  const { data: branches } = useBranchesForDisplay();
  const { data: vehicles } = useAllVehicles();
  const { data: tickets } = useAllTripTickets();
  const report = useQuery({
    queryKey: ['reports', generated],
    queryFn: () => getReport(generated!),
    enabled: generated !== null,
    retry: false
  });
  const dirty =
    generated !== null &&
    JSON.stringify(asQuery(form)) !== JSON.stringify(generated);
  const set = (key: keyof Filters, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const generate = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = reportQuerySchema.safeParse(asQuery(form));
    if (!parsed.success) {
      setValidation(
        parsed.error.issues.map((issue) => issue.message).join('. ')
      );
      return;
    }
    setValidation('');
    if (JSON.stringify(parsed.data) === JSON.stringify(generated))
      void report.refetch();
    else setGenerated(parsed.data);
  };
  const availableVehicles = (vehicles ?? []).filter(
    (v) =>
      !['maintenance', 'preventive'].includes(form.type) ||
      !form.branchId ||
      v.branch === form.branchId
  );
  const newTrips = (tickets ?? []).filter(
    (t) =>
      t.vehicle_id === form.vehicleId &&
      (!form.branchId || t.branch_id === form.branchId) &&
      !['cancelled', 'disapproved', 'completed'].includes(t.status ?? '')
  );
  const statusLabel = (value: string) =>
    value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  const canExport =
    !!report.data && !report.isFetching && !report.isError && !dirty;
  const excel = async () => {
    if (!report.data) return;
    setExporting(true);
    try {
      await downloadReportExcel(report.data);
    } catch {
      toast.error('Excel export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Generate, export, and print trip, fleet, maintenance, and fuel records."
      />
      <Card className="gap-4 py-5">
        <CardHeader className="flex flex-row items-center justify-between gap-3 px-5">
          <div className="flex items-center gap-2">
            <SlidersHorizontal
              aria-hidden="true"
              className="text-muted-foreground size-4"
            />
            <h2 className="text-sm font-semibold">Report filters</h2>
          </div>
          <span className="text-muted-foreground text-xs">
            Dates use Asia/Manila
          </span>
        </CardHeader>
        <CardContent className="px-5">
          <form onSubmit={generate} className="space-y-5">
            <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="report-type">Report</Label>
                <Select
                  value={form.type}
                  onValueChange={(value) =>
                    setForm((previous) => ({
                      ...previous,
                      type: value as ReportType,
                      status: value === 'trips' ? 'completed' : '',
                      tripId: ''
                    }))
                  }
                >
                  <SelectTrigger id="report-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(REPORT_TITLES).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="report-branch">
                  {['maintenance', 'preventive'].includes(form.type)
                    ? 'Vehicle branch'
                    : 'Request branch'}
                </Label>
                <Select
                  value={form.branchId || 'all'}
                  onValueChange={(value) =>
                    setForm((previous) => ({
                      ...previous,
                      branchId: value === 'all' ? '' : value,
                      vehicleId: '',
                      tripId: ''
                    }))
                  }
                >
                  <SelectTrigger id="report-branch" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All branches</SelectItem>
                    {branches?.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="report-vehicle">
                  Vehicle{form.type === 'fuel' ? ' *' : ''}
                </Label>
                <Select
                  value={form.vehicleId || 'all'}
                  onValueChange={(value) =>
                    setForm((previous) => ({
                      ...previous,
                      vehicleId: value === 'all' ? '' : value,
                      tripId: ''
                    }))
                  }
                >
                  <SelectTrigger id="report-vehicle" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {form.type === 'fuel'
                        ? 'Select a vehicle'
                        : 'All vehicles'}
                    </SelectItem>
                    {availableVehicles.map((vehicle) => (
                      <SelectItem key={vehicle.id} value={vehicle.id}>
                        {vehicle.license_plate} · {vehicle.make} {vehicle.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="report-from">From date</Label>
                <DatePicker
                  id="report-from"
                  aria-label="Report from date"
                  value={form.from}
                  onChange={(value) => set('from', value)}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="report-to">To date</Label>
                <DatePicker
                  id="report-to"
                  aria-label="Report to date"
                  value={form.to}
                  min={form.from || undefined}
                  onChange={(value) => set('to', value)}
                />
              </div>
              {statuses[form.type] && (
                <div className="flex min-w-0 flex-col gap-2">
                  <Label htmlFor="report-status">Status</Label>
                  <Select
                    value={form.status || 'all'}
                    onValueChange={(value) => set('status', value)}
                  >
                    <SelectTrigger id="report-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {statuses[form.type]?.map((value) => (
                        <SelectItem key={value} value={value}>
                          {statusLabel(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {form.type === 'fuel' && (
              <fieldset className="bg-muted/20 grid items-start gap-4 rounded-lg border p-4 lg:grid-cols-3">
                <legend className="px-2 text-sm font-semibold">
                  New-trip estimate
                </legend>
                <div className="flex min-w-0 flex-col gap-2">
                  <Label htmlFor="fuel-trip">Trip ticket (optional)</Label>
                  <Select
                    value={form.tripId || 'none'}
                    onValueChange={(value) => {
                      const trip = newTrips.find((t) => t.id === value);
                      setForm((previous) => ({
                        ...previous,
                        tripId: value === 'none' ? '' : value,
                        proposedLiters:
                          trip?.allocation_liters !== undefined &&
                          trip.allocation_liters !== null
                            ? String(trip.allocation_liters)
                            : previous.proposedLiters
                      }));
                    }}
                  >
                    <SelectTrigger id="fuel-trip" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unbooked estimate</SelectItem>
                      {newTrips.map((trip) => (
                        <SelectItem key={trip.id} value={trip.id}>
                          {formatRef('TT', trip.ticket_no)} · {trip.destination}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <Label htmlFor="fuel-distance">
                    Planned route distance (km)
                  </Label>
                  <Input
                    id="fuel-distance"
                    type="number"
                    min="0.001"
                    max="50000"
                    step="any"
                    value={form.plannedDistanceKm}
                    onChange={(event) =>
                      set('plannedDistanceKm', event.target.value)
                    }
                    placeholder="For example, 40"
                  />
                  <p className="text-muted-foreground text-xs">
                    Use the planned road-route distance.
                  </p>
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <Label htmlFor="fuel-proposed">
                    Proposed fuel allocation (L)
                  </Label>
                  <Input
                    id="fuel-proposed"
                    type="number"
                    min="0"
                    max="100000"
                    step="any"
                    value={form.proposedLiters}
                    onChange={(event) =>
                      set('proposedLiters', event.target.value)
                    }
                    placeholder="For example, 10"
                  />
                </div>
              </fieldset>
            )}
            {validation && (
              <p role="alert" className="text-destructive text-sm">
                {validation}
              </p>
            )}
            <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setForm((previous) => ({ ...previous, from: '', to: '' }))
                }
              >
                Use all dates
              </Button>
              <Button
                type="submit"
                disabled={report.isFetching}
                className="ml-auto"
              >
                {report.isFetching ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                {report.isFetching ? 'Generating…' : 'Generate report'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {report.isError && (
        <div
          role="alert"
          className="border-destructive/40 text-destructive rounded-xl border p-5 text-sm"
        >
          {report.error instanceof Error
            ? report.error.message
            : 'Report could not be generated. Try again.'}
        </div>
      )}
      {dirty && (
        <p
          role="status"
          className="border-primary/20 bg-primary/5 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm"
        >
          <RefreshCw aria-hidden="true" className="size-4 shrink-0" />
          Filters changed. Generate the report again before exporting.
        </p>
      )}
      {!generated && (
        <div className="bg-muted/10 flex flex-col items-center rounded-xl border border-dashed px-6 py-10 text-center">
          <FileBarChart
            aria-hidden="true"
            className="text-muted-foreground mb-3 size-8"
          />
          <h2 className="text-sm font-semibold">Ready to generate</h2>
          <p className="text-muted-foreground mt-1 max-w-md text-sm">
            Choose a report and filters, then select Generate report.
          </p>
        </div>
      )}
      {report.data && !report.isError && (
        <section
          aria-label="Generated report"
          aria-busy={report.isFetching}
          className={`space-y-5 ${dirty ? 'opacity-60' : ''}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">{report.data.title}</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {report.data.filters.from ?? 'Beginning'} –{' '}
                {report.data.filters.to ?? 'Present'} · Asia/Manila
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {report.data.filters.branch ?? 'All branches'} ·{' '}
                {report.data.filters.vehicle ?? 'All vehicles'}
                {report.data.filters.status &&
                  ` · ${statusLabel(report.data.filters.status)}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!canExport}
                onClick={() => downloadReportCsv(report.data!)}
              >
                <Download className="size-4" />
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!canExport || exporting}
                onClick={() => void excel()}
              >
                <FileSpreadsheet className="size-4" />
                {exporting ? 'Exporting…' : 'Excel'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!canExport}
                onClick={() => printReport(report.data!)}
              >
                <Printer className="size-4" />
                Print / PDF
              </Button>
            </div>
          </div>
          {report.data.summary.length > 0 && (
            <dl className="bg-border grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-px overflow-hidden rounded-xl border">
              {report.data.summary.map((item) => (
                <div key={item.label} className="bg-card px-5 py-4">
                  <dt className="text-muted-foreground text-xs font-medium">
                    {item.label}
                  </dt>
                  <dd className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
                    {displayCell(item.value)}{' '}
                    {item.unit && (
                      <span className="text-muted-foreground text-sm font-normal">
                        {item.unit}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="bg-muted/20 border-b px-5 py-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                {report.data.type === 'fuel'
                  ? 'Historical fuel allocation records'
                  : 'Report records'}
                <span className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 text-xs font-medium tabular-nums">
                  {report.data.rows.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 px-0">
              <ReportTable report={report.data} />
            </CardContent>
          </Card>
          {report.data.fuel && <FuelDetails fuel={report.data.fuel} />}
          <div className="bg-muted/20 text-muted-foreground space-y-2 rounded-xl border p-5 text-sm">
            {report.data.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
            <p>
              Generated{' '}
              {new Date(report.data.generatedAt).toLocaleString('en-PH', {
                timeZone: 'Asia/Manila'
              })}{' '}
              (Asia/Manila).
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
