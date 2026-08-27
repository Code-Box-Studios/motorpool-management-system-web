import { z } from 'zod';
import { paginationQuerySchema } from './common.js';

export const APPROVAL_KINDS = ['fuel', 'repair'] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

export const approvalHistoryQuerySchema = paginationQuerySchema.extend({
  kind: z.enum(APPROVAL_KINDS).optional()
});
export type ApprovalHistoryQuery = z.infer<typeof approvalHistoryQuerySchema>;

/**
 * One decision, from either source, in one shape.
 *
 * A discriminated record rather than two lists: the History tab is a single
 * chronological column, and merging in the client would make the client own
 * pagination across two sources.
 */
export interface DecisionRecord {
  kind: ApprovalKind;
  id: string;
  ref: string; // 'TT-2044' | 'JO-118' — matches the web's formatRef
  linkTo: string; // '/trip-tickets/<uuid>' | '/job-order/<uuid>'
  outcome: 'approved' | 'declined';
  decidedAt: string | null;
  decidedByName: string | null;
  decidedByRole: string | null;
  reason: string | null; // declines only
  title: string;
  subtitle: string | null;
  liters: number | null; // fuel only
  fuelType: string | null; // fuel only
}
