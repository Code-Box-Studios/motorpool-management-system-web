import {
  REPORT_TITLES,
  type ReportColumn,
  type ReportQuery,
  type ReportResult
} from '@mms/shared';
import type { Prisma, TripDateStatus, JobOrderStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { deriveTrackingStatus } from '../maintenance/next-due.js';
import {
  dateLabel,
  timeLabel,
  timestampLabel,
  reference,
  titleCase
} from './format.js';
import { reportDateRange } from './math.js';
import { fuelReport } from './fuel.js';
const columns = (items: [string, string][]): ReportColumn[] =>
  items.map(([key, label]) => ({ key, label }));
const validStatus: Record<string, string[]> = {
  trips: ['scheduled', 'in_progress', 'completed', 'cancelled'],
  odometer: ['in_progress', 'completed'],
  job_orders: ['pending', 'assigned_mechanic', 'ongoing_repair', 'repaired'],
  preventive: ['overdue', 'due_soon', 'pending', 'completed', 'unconfigured'],
  maintenance: [],
  fuel: []
};

export async function generateReport(
  query: ReportQuery,
  now = new Date()
): Promise<ReportResult> {
  if (
    query.status &&
    query.status !== 'all' &&
    !validStatus[query.type]!.includes(query.status)
  )
    throw new AppError(
      400,
      'INVALID_STATUS',
      'Choose a valid status for this report'
    );
  const range = reportDateRange(query.from, query.to);
  const [branch, vehicle] = await Promise.all([
    query.branchId
      ? prisma.branch.findUnique({ where: { id: query.branchId } })
      : null,
    query.vehicleId
      ? prisma.vehicle.findUnique({ where: { id: query.vehicleId } })
      : null
  ]);
  if ((query.branchId && !branch) || (query.vehicleId && !vehicle))
    throw new AppError(
      404,
      'NOT_FOUND',
      'Selected report filter was not found'
    );
  const result: ReportResult = {
    type: query.type,
    title: REPORT_TITLES[query.type],
    generatedAt: now.toISOString(),
    filters: {
      from: query.from ?? null,
      to: query.to ?? null,
      branch: branch?.name ?? null,
      vehicle: vehicle
        ? `${vehicle.licensePlate} · ${vehicle.make} ${vehicle.model}`
        : null,
      status: query.status ?? (query.type === 'trips' ? 'completed' : null)
    },
    columns: [],
    rows: [],
    summary: [],
    notes: [
      'Dates and times use Asia/Manila. Missing historical values are not inferred.'
    ]
  };
  const vehicleFilter: Prisma.VehicleWhereInput = {
    ...(query.vehicleId ? { id: query.vehicleId } : {}),
    ...(query.branchId ? { branchId: query.branchId } : {})
  };
  if (query.type === 'fuel') return { ...result, ...(await fuelReport(query)) };
  if (query.type === 'trips' || query.type === 'odometer') {
    const ticketWhere: Prisma.TripTicketWhereInput = {
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {})
    };
    const where: Prisma.TripDateWhereInput = {
      tripTicket: ticketWhere,
      ...(query.status && query.status !== 'all'
        ? { status: query.status as TripDateStatus }
        : query.type === 'trips' && !query.status
          ? { status: 'completed' }
          : {}),
      ...(query.type === 'odometer'
        ? { preTripCheckedAt: { not: null, ...range } }
        : { startTs: range })
    };
    const dates = await prisma.tripDate.findMany({
      where,
      include: { tripTicket: { include: { driver: true, vehicle: true } } },
      orderBy: [{ startTs: 'asc' }, { id: 'asc' }]
    });
    result.columns =
      query.type === 'trips'
        ? columns([
            ['reference', 'Trip ticket'],
            ['date', 'Departure date'],
            ['startTime', 'Start time'],
            ['returnDate', 'Return date'],
            ['returnTime', 'Return time'],
            ['driver', 'Driver'],
            ['plate', 'Plate number'],
            ['destination', 'Destination'],
            ['purpose', 'Purpose'],
            ['status', 'Outing status'],
            ['gateOut', 'Gate out'],
            ['gateIn', 'Gate in']
          ])
        : columns([
            ['reference', 'Trip ticket'],
            ['date', 'Outing date'],
            ['plate', 'Plate number'],
            ['driver', 'Assigned driver'],
            ['startOdometer', 'Start odometer (km)'],
            ['endOdometer', 'End odometer (km)'],
            ['distance', 'Distance (km)'],
            ['gateOut', 'Gate out'],
            ['gateIn', 'Gate in']
          ]);
    result.rows = dates.map((d) => {
      const t = d.tripTicket;
      const common = {
        reference: reference('TT', t.ticketNo),
        date: dateLabel(
          query.type === 'odometer' ? d.preTripCheckedAt : d.startTs
        ),
        driver: t.driver.fullName,
        plate: t.vehicle.licensePlate,
        gateOut: timestampLabel(d.preTripCheckedAt),
        gateIn: timestampLabel(d.postTripCheckedAt)
      };
      return query.type === 'trips'
        ? {
            ...common,
            startTime: timeLabel(d.startTs),
            returnDate: dateLabel(d.endTs),
            returnTime: timeLabel(d.endTs),
            destination: t.destination,
            purpose: t.purpose,
            status: titleCase(d.status)
          }
        : {
            ...common,
            startOdometer: d.startMileage,
            endOdometer: d.endMileage,
            distance:
              d.startMileage === null || d.endMileage === null
                ? null
                : d.endMileage - d.startMileage
          };
    });
    result.summary = [
      { label: 'Outings', value: dates.length },
      {
        label: 'Vehicles',
        value: new Set(dates.map((d) => d.tripTicket.vehicleId)).size
      }
    ];
    if (query.type === 'odometer')
      result.summary.push({
        label: 'Outings missing readings',
        value: dates.filter(
          (d) => d.startMileage === null || d.endMileage === null
        ).length
      });
  } else if (query.type === 'maintenance') {
    const rows = await prisma.maintenance.findMany({
      where: { vehicle: vehicleFilter, date: range },
      include: { vehicle: true },
      orderBy: [{ date: 'asc' }, { id: 'asc' }]
    });
    result.columns = columns([
      ['plate', 'Plate number'],
      ['type', 'Maintenance type'],
      ['date', 'Service date'],
      ['mileage', 'Odometer (km)'],
      ['description', 'Description'],
      ['cost', 'Cost (PHP)'],
      ['nextDue', 'Next due date']
    ]);
    result.rows = rows.map((m) => ({
      plate: m.vehicle.licensePlate,
      type: titleCase(m.type),
      date: dateLabel(m.date),
      mileage: m.mileage,
      description: m.description,
      cost: m.cost,
      nextDue: dateLabel(m.nextDue)
    }));
    result.summary = [
      { label: 'Maintenance records', value: rows.length },
      {
        label: 'Recorded cost',
        value: rows.reduce((sum, m) => sum + (m.cost ?? 0), 0),
        unit: 'PHP'
      }
    ];
    result.notes.push(
      'Recorded cost excludes entries without a recorded cost.'
    );
  } else if (query.type === 'job_orders') {
    const rows = await prisma.jobOrder.findMany({
      where: {
        ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.status && query.status !== 'all'
          ? { status: query.status as JobOrderStatus }
          : {}),
        ...(query.from || query.to
          ? {
              OR: [
                { dateOfRequest: range },
                { dateOfRequest: null, createdAt: range }
              ]
            }
          : {})
      },
      include: { vehicle: true, assignedMechanic: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    });
    result.columns = columns([
      ['reference', 'Job order'],
      ['plate', 'Plate number'],
      ['maintenanceType', 'Maintenance type'],
      ['date', 'Request date'],
      ['mechanic', 'Assigned mechanic'],
      ['status', 'Status'],
      ['serviceLocation', 'Service location'],
      ['repairType', 'Repair complexity'],
      ['notes', 'Notes']
    ]);
    result.rows = rows.map((o) => ({
      reference: reference('JO', o.orderNo),
      plate: o.vehicle.licensePlate,
      maintenanceType: titleCase(o.maintenanceType),
      date: dateLabel(o.dateOfRequest ?? o.createdAt),
      mechanic: o.assignedMechanic?.fullName ?? null,
      status: titleCase(o.status),
      serviceLocation: titleCase(o.serviceLocation),
      repairType: titleCase(o.repairDone),
      notes: o.remarks ?? o.incidentDetails
    }));
    result.summary = [
      { label: 'Job orders', value: rows.length },
      {
        label: 'Repaired',
        value: rows.filter((o) => o.status === 'repaired').length
      }
    ];
    result.notes.push(
      'Request date uses the recorded request date, or the creation date when no request date was recorded.'
    );
  } else {
    const vehicles = await prisma.vehicle.findMany({
      where: vehicleFilter,
      include: {
        maintenanceStandard: { include: { scheduleItems: true } },
        maintenanceTracking: { include: { scheduleItem: true } }
      },
      orderBy: [{ licensePlate: 'asc' }, { id: 'asc' }]
    });
    result.columns = columns([
      ['plate', 'Plate number'],
      ['standard', 'Maintenance standard'],
      ['task', 'Task'],
      ['interval', 'Rule / interval'],
      ['lastDate', 'Last completed date'],
      ['lastMileage', 'Last completed (km)'],
      ['mileage', 'Current odometer (km)'],
      ['nextDate', 'Next due date'],
      ['nextMileage', 'Next due (km)'],
      ['status', 'Status']
    ]);
    for (const v of vehicles) {
      const tasks = v.maintenanceStandard?.scheduleItems ?? [];
      if (!tasks.length) {
        if (
          !query.status ||
          query.status === 'all' ||
          query.status === 'unconfigured'
        )
          result.rows.push({
            plate: v.licensePlate,
            standard: v.maintenanceStandard?.name ?? null,
            task: 'No maintenance schedule configured',
            interval: null,
            lastDate: null,
            lastMileage: null,
            mileage: v.mileage,
            nextDate: null,
            nextMileage: null,
            status: 'Unconfigured'
          });
        continue;
      }
      for (const item of tasks) {
        const tracking = v.maintenanceTracking.find(
          (t) => t.maintenanceScheduleItemId === item.id
        );
        const status = tracking
          ? deriveTrackingStatus(tracking, now, v.mileage)
          : 'unconfigured';
        if (query.status && query.status !== 'all' && query.status !== status)
          continue;
        if (
          tracking?.nextDueDate &&
          ((range.gte && tracking.nextDueDate < range.gte) ||
            (range.lt && tracking.nextDueDate >= range.lt))
        )
          continue;
        const interval = [
          item.intervalMileage
            ? `${item.intervalMileage.toLocaleString('en-US')} km`
            : null,
          item.intervalMonths
            ? `${item.intervalMonths} month${item.intervalMonths === 1 ? '' : 's'}`
            : null
        ]
          .filter(Boolean)
          .join(' or ');
        result.rows.push({
          plate: v.licensePlate,
          standard: v.maintenanceStandard?.name ?? null,
          task: item.taskName,
          interval: interval ? `Every ${interval}` : null,
          lastDate: dateLabel(tracking?.lastCompletedDate),
          lastMileage: tracking?.lastCompletedMileage ?? null,
          mileage: v.mileage,
          nextDate: dateLabel(tracking?.nextDueDate),
          nextMileage: tracking?.nextDueMileage ?? null,
          status: titleCase(status)
        });
      }
    }
    result.summary = [
      {
        label: 'Schedule items / unconfigured vehicles',
        value: result.rows.length
      },
      {
        label: 'Overdue tasks',
        value: result.rows.filter((r) => r.status === 'Overdue').length
      }
    ];
    result.notes.push(
      'Uses each vehicle’s configured maintenance standard and completion tracking. Mileage-only and undated tasks remain visible with a date range. No universal oil-change interval is assumed.'
    );
  }
  return result;
}
