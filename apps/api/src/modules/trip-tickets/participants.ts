import type { Prisma, TripParticipantType } from '@prisma/client';
import { AppError } from '../../lib/errors.js';

interface ParticipantInput {
  participantType?: TripParticipantType;
  participantEmployeeIds?: string[];
  participants?: string[];
  participantsCount?: number | null;
}

interface ExistingParticipants {
  participantType: TripParticipantType;
  participants: string[];
  participantsCount: number | null;
  participantEmployees: { employeeId: string }[];
}

export function sameEmployeeIds(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    left.every((id) => right.includes(id))
  );
}

/** Resolve roster identities into historical names without trusting client labels. */
export async function resolveTripParticipants(
  tx: Prisma.TransactionClient,
  input: ParticipantInput,
  existing?: ExistingParticipants
) {
  const participantType =
    input.participantType ?? existing?.participantType ?? 'students';
  if (participantType === 'students') {
    if (input.participantEmployeeIds?.length) {
      throw new AppError(
        400,
        'INVALID_PARTICIPANTS',
        'Student participants use names instead of employee selections'
      );
    }
    if (
      existing?.participantType === 'employees' &&
      !input.participants?.length
    ) {
      throw new AppError(
        400,
        'INVALID_PARTICIPANTS',
        'Enter student names when changing the participant type'
      );
    }
    const participants = input.participants ?? existing?.participants ?? [];
    const participantsCount =
      input.participantsCount !== undefined
        ? input.participantsCount
        : input.participants !== undefined && participants.length > 0
          ? participants.length
          : (existing?.participantsCount ?? null);
    return {
      participantType,
      participants,
      participantsCount,
      employeeIds: [] as string[],
      replaceMembership: existing?.participantType === 'employees'
    };
  }

  const currentIds =
    existing?.participantType === 'employees'
      ? existing.participantEmployees.map((row) => row.employeeId)
      : [];
  const employeeIds = input.participantEmployeeIds ?? currentIds;
  if (
    employeeIds.length === 0 ||
    new Set(employeeIds).size !== employeeIds.length
  ) {
    throw new AppError(
      400,
      'INVALID_PARTICIPANTS',
      'Select at least one distinct active employee participant'
    );
  }
  const unchanged =
    existing?.participantType === 'employees' &&
    sameEmployeeIds(employeeIds, currentIds);
  let participants: string[];
  if (unchanged) {
    // Full form submissions may include unchanged archived identities. Their
    // original names remain a snapshot, including after a roster rename.
    participants = existing.participants;
  } else {
    const employees = await tx.employee.findMany({
      where: { id: { in: employeeIds }, archivedAt: null },
      select: { id: true, name: true }
    });
    if (employees.length !== employeeIds.length) {
      throw new AppError(
        400,
        'INVALID_PARTICIPANTS',
        'Select distinct active employees as participants'
      );
    }
    const byId = new Map(
      employees.map((employee) => [employee.id, employee.name])
    );
    participants = employeeIds.map((id) => byId.get(id)!);
  }
  const participantsCount =
    input.participantsCount !== undefined
      ? input.participantsCount
      : employeeIds.length;
  return {
    participantType,
    participants,
    participantsCount,
    employeeIds,
    replaceMembership: !unchanged
  };
}

export function assertTripGuideRules(
  participantType: TripParticipantType,
  guideIds: string[],
  participantEmployeeIds: string[] = []
): void {
  if (participantType === 'students' && guideIds.length === 0) {
    throw new AppError(
      400,
      'NO_GUIDES',
      'Student trips require at least one guide'
    );
  }
  if (guideIds.some((id) => participantEmployeeIds.includes(id))) {
    throw new AppError(
      400,
      'DUPLICATE_TRIP_EMPLOYEE',
      'An employee cannot be selected as both a participant and a guide'
    );
  }
}

export async function replaceTripParticipants(
  tx: Prisma.TransactionClient,
  tripTicketId: string,
  employeeIds: string[]
): Promise<void> {
  await tx.tripTicketParticipant.deleteMany({ where: { tripTicketId } });
  if (employeeIds.length) {
    await tx.tripTicketParticipant.createMany({
      data: employeeIds.map((employeeId) => ({ tripTicketId, employeeId }))
    });
  }
}
