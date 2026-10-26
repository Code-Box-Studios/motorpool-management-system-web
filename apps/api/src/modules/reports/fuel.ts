import type { ReportQuery, ReportResult } from '@mms/shared';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { estimateFuel, gpsDistance, reportDateRange } from './math.js';
import { dateLabel, reference } from './format.js';

export async function fuelReport(
  query: ReportQuery
): Promise<
  Pick<ReportResult, 'rows' | 'columns' | 'notes' | 'summary' | 'fuel'>
> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: query.vehicleId! }
  });
  if (!vehicle) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');
  const range = reportDateRange(query.from, query.to);
  const tickets = await prisma.tripTicket.findMany({
    where: {
      vehicleId: vehicle.id,
      OR: [
        { status: 'completed' },
        { dates: { some: { status: 'completed' } } }
      ],
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.from || query.to
        ? {
            dates: {
              some: {
                OR: [
                  { startTs: range },
                  { preTripCheckedAt: range },
                  { postTripCheckedAt: range },
                  { startTs: { lt: range.lt }, endTs: { gte: range.gte } }
                ]
              }
            }
          }
        : {})
    },
    include: {
      dates: { orderBy: { startTs: 'asc' } },
      fuelAllocation: true,
      branch: true
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  });
  const outings = tickets
    .flatMap((t) => t.dates)
    .filter((d) => d.preTripCheckedAt && d.postTripCheckedAt);
  const starts = outings.map((d) => d.preTripCheckedAt!.getTime()),
    ends = outings.map((d) => d.postTripCheckedAt!.getTime());
  const samples = starts.length
    ? await prisma.gpsData.findMany({
        where: {
          vehicleId: vehicle.id,
          createdAt: {
            gte: new Date(Math.min(...starts)),
            lte: new Date(Math.max(...ends))
          }
        },
        select: {
          tripId: true,
          latitude: true,
          longitude: true,
          createdAt: true
        },
        orderBy: { createdAt: 'asc' }
      })
    : [];
  const excluded: { reference: string; reason: string }[] = [];
  const rows: ReportResult['rows'] = [];
  let totalLiters = 0,
    totalDistanceKm = 0;
  for (const ticket of tickets) {
    const ref = reference('TT', ticket.ticketNo);
    const live = ticket.dates.filter((d) => d.status !== 'cancelled');
    let reason: string | null = null;
    if (
      !live.length ||
      live.some(
        (d) =>
          d.status !== 'completed' ||
          !d.preTripCheckedAt ||
          !d.postTripCheckedAt
      )
    )
      reason = 'Incomplete outing or missing gate timestamps';
    else if (
      live.some(
        (d) =>
          (range.gte && d.preTripCheckedAt! < range.gte) ||
          (range.lt && d.postTripCheckedAt! >= range.lt)
      )
    )
      reason =
        'The full ticket falls outside the selected period; allocation cannot be split reliably';
    else if (
      !ticket.fuelAllocation ||
      ticket.fuelAllocation.status !== 'approved' ||
      ticket.fuelAllocation.liters <= 0
    )
      reason = 'No positive approved fuel allocation';
    let distance = 0;
    if (!reason)
      for (const outing of live) {
        const result = gpsDistance(
          samples.filter((p) => p.tripId === null || p.tripId === ticket.id),
          outing.preTripCheckedAt!,
          outing.postTripCheckedAt!
        );
        if (result.reason) {
          reason = result.reason;
          break;
        }
        distance += result.distanceKm!;
      }
    if (reason) {
      excluded.push({ reference: ref, reason });
      continue;
    }
    const liters = ticket.fuelAllocation!.liters;
    totalDistanceKm += distance;
    totalLiters += liters;
    rows.push({
      reference: ref,
      date: dateLabel(live[0]!.preTripCheckedAt),
      origin: ticket.branch.location ?? ticket.branch.name,
      destination: ticket.destination,
      outings: live.length,
      distance,
      fuel: liters
    });
  }
  let selectedTrip: NonNullable<ReportResult['fuel']>['selectedTrip'] = null;
  let proposedLiters = query.proposedLiters;
  if (query.tripId) {
    const trip = await prisma.tripTicket.findUnique({
      where: { id: query.tripId },
      include: { branch: true, fuelAllocation: true }
    });
    if (
      !trip ||
      trip.vehicleId !== vehicle.id ||
      (query.branchId && trip.branchId !== query.branchId)
    )
      throw new AppError(
        400,
        'INVALID_TRIP',
        'Choose a trip assigned to the selected vehicle and branch'
      );
    if (
      trip.status === 'cancelled' ||
      trip.status === 'disapproved' ||
      trip.status === 'completed'
    )
      throw new AppError(
        400,
        'INVALID_TRIP',
        'Choose a new or active trip for the estimate'
      );
    selectedTrip = {
      reference: reference('TT', trip.ticketNo),
      origin: trip.branch.location ?? trip.branch.name,
      destination: trip.destination,
      purpose: trip.purpose
    };
    proposedLiters ??= trip.fuelAllocation?.liters;
  }
  const rate =
    totalDistanceKm > 0 && totalLiters > 0
      ? totalLiters / totalDistanceKm
      : null;
  const estimate = estimateFuel(
    totalLiters,
    totalDistanceKm,
    query.plannedDistanceKm,
    proposedLiters
  );
  return {
    columns: [
      { key: 'reference', label: 'Trip ticket' },
      { key: 'date', label: 'Trip date' },
      { key: 'origin', label: 'Origin' },
      { key: 'destination', label: 'Destination' },
      { key: 'outings', label: 'Outings' },
      { key: 'distance', label: 'GPS distance (km)' },
      { key: 'fuel', label: 'Fuel allocated (L)' }
    ],
    rows,
    summary: [
      { label: 'Eligible completed trips', value: rows.length },
      { label: 'Total GPS distance', value: totalDistanceKm, unit: 'km' },
      { label: 'Total fuel allocated', value: totalLiters, unit: 'L' },
      {
        label: 'Historical allocation rate',
        value: rate ?? 'Unavailable',
        unit: rate === null ? undefined : 'L/km'
      }
    ],
    notes: [
      'This estimate uses approved fuel allocations, not measured fuel consumption or verified fuel dispensing.',
      'Historical rate = total eligible allocated liters ÷ total eligible GPS kilometers. New-trip estimate = planned route kilometers × historical rate.',
      'Each ticket allocation is counted once across all its completed outings. Partial tickets and unsuitable traces are excluded.',
      'GPS quality requires at least two valid samples per outing, gaps and gate-boundary coverage within 15 minutes, and segment speeds no higher than 180 km/h.',
      'Planned route distance is supplied for estimation; it is not a straight-line distance or a recorded future GPS trace.',
      'GPS timestamps reflect receipt by the system. Delayed or buffered uploads can affect outing attribution and coverage; review excluded history before using the estimate.'
    ],
    fuel: {
      vehicle: `${vehicle.licensePlate} · ${vehicle.make} ${vehicle.model}`,
      totalLiters,
      totalDistanceKm,
      rate,
      plannedDistanceKm: query.plannedDistanceKm ?? null,
      proposedLiters: proposedLiters ?? null,
      estimate,
      selectedTrip,
      excluded
    }
  };
}
