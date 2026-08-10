import type { Request, Response } from 'express';
import type { CompleteRepairBody, NoteJobOrderBody } from '@mms/shared';
import { requireIdParam, requireUser } from '../../lib/http.js';
import * as transitions from './transitions.js';

export async function note(req: Request, res: Response): Promise<void> {
  res.json(
    await transitions.note(
      requireIdParam(req),
      requireUser(req),
      req.body as NoteJobOrderBody
    )
  );
}

export async function approve(req: Request, res: Response): Promise<void> {
  res.json(await transitions.approve(requireIdParam(req), requireUser(req)));
}

export async function completeRepair(
  req: Request,
  res: Response
): Promise<void> {
  res.json(
    await transitions.completeRepair(
      requireIdParam(req),
      requireUser(req),
      req.body as CompleteRepairBody
    )
  );
}
