import { api } from './client.js';
import type { DecisionRecord } from '@mms/shared';

export async function getApprovalHistory(
  page = 1,
  limit = 10,
  kind?: 'fuel' | 'repair'
): Promise<{ data: DecisionRecord[]; count: number }> {
  return api.get<{ data: DecisionRecord[]; count: number }>(
    '/approvals/history',
    { page, limit, ...(kind ? { kind } : {}) }
  );
}
