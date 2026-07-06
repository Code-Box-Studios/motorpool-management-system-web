import type { Request, Response } from 'express';
import type { ApproveTripTicketBody, ReasonBody } from '@mms/shared';
import { requireIdParam, requireUser } from '../../lib/http.js';
import * as transitions from './transitions.js';

export async function approve(req: Request, res: Response): Promise<void> {
  res.json(await transitions.approve(requireIdParam(req), requireUser(req), req.body as ApproveTripTicketBody));
}

export async function approveEvp(req: Request, res: Response): Promise<void> {
  res.json(await transitions.approveEvp(requireIdParam(req), requireUser(req)));
}

export async function disapprove(req: Request, res: Response): Promise<void> {
  res.json(await transitions.disapprove(requireIdParam(req), requireUser(req), (req.body as ReasonBody).reason));
}

export async function cancel(req: Request, res: Response): Promise<void> {
  res.json(await transitions.cancel(requireIdParam(req), requireUser(req), (req.body as ReasonBody).reason));
}
