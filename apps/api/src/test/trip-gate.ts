import { prisma } from '../lib/prisma.js';

/** Get the current fixture outing ID for a fresh, intentional gate request. */
export async function fixtureGateDateId(ticketId: string): Promise<string> {
  const dates = await prisma.tripDate.findMany({
    where: { tripTicketId: ticketId },
    orderBy: { startTs: 'asc' }
  });
  const date =
    dates.find((row) => row.status === 'in_progress') ??
    dates.find((row) => row.status === 'scheduled') ??
    dates[0];
  if (!date) throw new Error(`Trip fixture ${ticketId} has no outing`);
  return date.id;
}
