import type { Request, Response } from 'express';
import type {
  ApproveTripTicketBody,
  CheckInBody,
  CheckOutBody,
  DriverOdometerBody,
  ReasonBody,
  ReassignGuidesBody
} from '@mms/shared';
import { requireIdParam, requireParam, requireUser } from '../../lib/http.js';
import * as transitions from './transitions.js';

export async function approve(req: Request, res: Response): Promise<void> {
  res.json(
    await transitions.approve(
      requireIdParam(req),
      requireUser(req),
      req.body as ApproveTripTicketBody
    )
  );
}

export async function approveEvp(req: Request, res: Response): Promise<void> {
  res.json(await transitions.approveEvp(requireIdParam(req), requireUser(req)));
}

export async function disapprove(req: Request, res: Response): Promise<void> {
  res.json(
    await transitions.disapprove(
      requireIdParam(req),
      requireUser(req),
      (req.body as ReasonBody).reason
    )
  );
}

export async function cancel(req: Request, res: Response): Promise<void> {
  res.json(
    await transitions.cancel(
      requireIdParam(req),
      requireUser(req),
      (req.body as ReasonBody).reason
    )
  );
}

export async function cancelDate(req: Request, res: Response): Promise<void> {
  res.json(
    await transitions.cancelDate(
      requireIdParam(req),
      requireParam(req, 'dateId'),
      requireUser(req),
      (req.body as ReasonBody).reason
    )
  );
}

export async function checkOut(req: Request, res: Response): Promise<void> {
  res.json(
    await transitions.checkOut(
      requireIdParam(req),
      requireUser(req),
      req.body as CheckOutBody
    )
  );
}

export async function checkIn(req: Request, res: Response): Promise<void> {
  res.json(
    await transitions.checkIn(
      requireIdParam(req),
      requireUser(req),
      req.body as CheckInBody
    )
  );
}

// No requireUser here, unlike its neighbours: reassignGuides takes no actor —
// the route is admin-gated and the transition raises no notification.
export async function reassignGuides(
  req: Request,
  res: Response
): Promise<void> {
  res.json(
    await transitions.reassignGuides(
      requireIdParam(req),
      (req.body as ReassignGuidesBody).guideIds
    )
  );
}

export async function recordOdometer(
  req: Request,
  res: Response
): Promise<void> {
  res.json(
    await transitions.recordOdometer(
      requireIdParam(req),
      requireParam(req, 'dateId'),
      requireUser(req),
      req.body as DriverOdometerBody
    )
  );
}
