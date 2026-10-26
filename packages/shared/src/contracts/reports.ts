import { z } from 'zod';

export const REPORT_TITLES = {
  trips: 'Summary of trips',
  maintenance: 'Maintenance report',
  preventive: 'Preventive maintenance report',
  job_orders: 'Job order summary',
  odometer: 'Odometer report',
  fuel: 'GPS-based fuel requirement report'
} as const;
export type ReportType = keyof typeof REPORT_TITLES;
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, 'Choose a valid calendar date');
export const reportQuerySchema = z
  .object({
    type: z
      .enum([
        'trips',
        'maintenance',
        'preventive',
        'job_orders',
        'odometer',
        'fuel'
      ])
      .default('trips'),
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    branchId: z.string().uuid().optional(),
    vehicleId: z.string().uuid().optional(),
    status: z.string().max(60).optional(),
    tripId: z.string().uuid().optional(),
    plannedDistanceKm: z.coerce
      .number()
      .finite()
      .positive()
      .max(50000)
      .optional(),
    proposedLiters: z.coerce
      .number()
      .finite()
      .nonnegative()
      .max(100000)
      .optional()
  })
  .superRefine((query, ctx) => {
    if (query.from && query.to && query.to < query.from)
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'End date must be on or after start date'
      });
    if (query.type === 'fuel' && !query.vehicleId)
      ctx.addIssue({
        code: 'custom',
        path: ['vehicleId'],
        message: 'Select a vehicle for the fuel report'
      });
  });
export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type ReportCell = string | number | null;
export interface ReportColumn {
  key: string;
  label: string;
}
export interface FuelEstimate {
  rate: number;
  estimatedLiters: number;
  proposedLiters: number | null;
  difference: number | null;
}
export interface FuelReportDetails {
  vehicle: string;
  totalLiters: number;
  totalDistanceKm: number;
  rate: number | null;
  plannedDistanceKm: number | null;
  proposedLiters: number | null;
  estimate: FuelEstimate | null;
  selectedTrip: {
    reference: string;
    origin: string | null;
    destination: string;
    purpose: string;
  } | null;
  excluded: { reference: string; reason: string }[];
}
export interface ReportResult {
  type: ReportType;
  title: string;
  generatedAt: string;
  filters: {
    from: string | null;
    to: string | null;
    branch: string | null;
    vehicle: string | null;
    status: string | null;
  };
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  summary: { label: string; value: number | string; unit?: string }[];
  notes: string[];
  fuel?: FuelReportDetails;
}
