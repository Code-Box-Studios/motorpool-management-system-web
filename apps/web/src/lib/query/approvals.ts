import { useQuery } from '@tanstack/react-query';
import { getApprovalHistory } from '@/lib/api/approvals';

// `enabled` gates the fetch until the History tab is actually opened — the
// queue is what the EVP lands on, and most visits never leave it.
export const useApprovalHistory = (
  page: number,
  limit = 10,
  enabled = true
) =>
  useQuery({
    queryKey: ['approvals', 'history', page, limit],
    queryFn: () => getApprovalHistory(page, limit),
    enabled
  });
