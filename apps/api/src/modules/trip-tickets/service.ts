import type { Prisma } from '@prisma/client';
import type { CreateTripTicketBody, TripTicketsListQuery, UpdateTripTicketBody } from '@mms/shared';
import { AppError } from '../../lib/errors.js';
import { toSkipTake } from '../../lib/pagination.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthenticatedUser } from '../../middleware/require-auth.js';
import { findDriverByUserId } from '../drivers/repository.js';
import { findTripTicketById, listTripTickets, tripTicketInclude } from './repository.js';

// Builds the visibility filter for a caller (spec §5): requester → own;
// driver → own trips (via drivers.userId); admin/evp/guard → unfiltered.
async function scopeFor(actor: AuthenticatedUser): Promise<Prisma.TripTicketWhereInput> {
  if (actor.role === 'requester') return { requestedById: actor.id };
  if (actor.role === 'driver') {
    const driver = await findDriverByUserId(actor.id);
    // No linked driver row → sees nothing (a uuid that can't match any driverId).
    return { driverId: driver?.id ?? '00000000-0000-4000-8000-000000000000' };
  }
  return {};
}

export async function list(query: TripTicketsListQuery, actor: AuthenticatedUser) {
  const scope = await scopeFor(actor);
  const filters: Prisma.TripTicketWhereInput = {
    ...(query.requestedBy ? { requestedById: query.requestedBy } : {}),
    ...(query.branchId ? { branchId: query.branchId } : {}),
    ...(query.driverId ? { driverId: query.driverId } : {}),
    ...(query.status ? { status: query.status } : {})
  };
  // AND the caller's scope with the client filters — NEVER merge them by spread,
  // or a requester/driver ?requestedBy=/?driverId= filter would OVERWRITE the
  // scope key and read others' tickets (spec §5 IDOR). AND keeps scope binding:
  // admin/evp/guard scope is {} so their filters apply unchanged.
  const where: Prisma.TripTicketWhereInput = { AND: [scope, filters] };
  return listTripTickets(where, toSkipTake(query));
}

export async function getById(id: string, actor: AuthenticatedUser) {
  const ticket = await findTripTicketById(id);
  if (!ticket) throw new AppError(404, 'NOT_FOUND', 'Trip ticket not found');
  // Enforce the same scoping on the detail read (not-found masking).
  if (actor.role === 'requester' && ticket.requestedById !== actor.id) {
    throw new AppError(404, 'NOT_FOUND', 'Trip ticket not found');
  }
  if (actor.role === 'driver') {
    const driver = await findDriverByUserId(actor.id);
    if (!driver || ticket.driverId !== driver.id) throw new AppError(404, 'NOT_FOUND', 'Trip ticket not found');
  }
  return ticket;
}

export async function create(body: CreateTripTicketBody) {
  return prisma.tripTicket.create({
    data: { ...body, status: 'pending_admin_approval' }, // status is never client-chosen
    include: tripTicketInclude
  });
}

export async function update(id: string, body: UpdateTripTicketBody, actor: AuthenticatedUser) {
  const existing = await findTripTicketById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Trip ticket not found');
  if (actor.role !== 'admin' && existing.requestedById !== actor.id) {
    throw new AppError(403, 'NOT_TICKET_OWNER', 'You may only edit your own trip ticket');
  }
  if (existing.status !== 'pending_admin_approval') {
    throw new AppError(409, 'INVALID_TRANSITION', 'Trip ticket can only be edited while pending admin approval');
  }
  await prisma.tripTicket.update({ where: { id }, data: body });
  return findTripTicketById(id);
}

export async function remove(id: string): Promise<void> {
  const existing = await findTripTicketById(id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Trip ticket not found');
  if (existing.status === 'in_progress') {
    throw new AppError(409, 'INVALID_TRANSITION', 'Cannot delete a trip ticket that is in progress');
  }
  await prisma.tripTicket.delete({ where: { id } }); // fuel_allocation cascades (schema onDelete: Cascade)
}

export { scopeFor };
