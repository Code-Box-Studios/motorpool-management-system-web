import { AppError } from '../../lib/errors.js';

type ReadingOuting = {
  status: string;
  startMileage: number | null;
  endMileage: number | null;
  preTripCheckedAt: Date | null;
  postTripCheckedAt: Date | null;
};

/** Validate a reading independently of persistence; gate timestamps define its chronology. */
export function validateDriverReading(
  outing: ReadingOuting,
  phase: 'before' | 'after',
  mileage: number,
  currentMileage: number,
  precedingMileage: number | null,
  followingMileage: number | null,
  laterDeparture: boolean
): void {
  const refuse = (message: string): never => {
    throw new AppError(409, 'INVALID_ODOMETER_READING', message);
  };
  if (!Number.isInteger(mileage) || mileage < 0)
    refuse('Mileage must be whole, nonnegative kilometers');
  if (outing.status === 'cancelled')
    refuse('Cancelled outings cannot receive readings');
  const existing = phase === 'before' ? outing.startMileage : outing.endMileage;
  if (
    existing !== null &&
    (laterDeparture ||
      (phase === 'before'
        ? outing.preTripCheckedAt !== null
        : outing.postTripCheckedAt !== null))
  ) {
    refuse('This recorded reading is frozen');
  }
  if (phase === 'after' && !outing.preTripCheckedAt)
    refuse('Gate departure is required before an ending reading');
  if (
    phase === 'before' &&
    outing.endMileage !== null &&
    mileage > outing.endMileage
  )
    refuse('Starting reading cannot exceed the ending reading');
  if (
    phase === 'after' &&
    outing.startMileage !== null &&
    mileage < outing.startMileage
  )
    refuse('Ending reading cannot be below the starting reading');
  if (
    (precedingMileage !== null && mileage < precedingMileage) ||
    (followingMileage !== null && mileage > followingMileage)
  )
    refuse('Reading contradicts neighboring gate readings');
  if (
    existing === null &&
    (!outing.preTripCheckedAt ||
      (phase === 'after' && !outing.postTripCheckedAt && !laterDeparture)) &&
    mileage < currentMileage
  )
    refuse('Reading cannot be below the current vehicle mileage');
}

export function gateStartingMileage(
  reading: number | null,
  precedingMileage: number | null
): number | null {
  return reading !== null &&
    precedingMileage !== null &&
    reading < precedingMileage
    ? null
    : reading;
}
