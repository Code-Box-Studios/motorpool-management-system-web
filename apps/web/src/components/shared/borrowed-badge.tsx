import { Badge } from '@/components/ui/badge';

// `wait` is the tone for "blocked on a human" — which is what a borrow is:
// something an approver has to agree to. The rule that decides when to show this
// lives in @/lib/borrowed.
export function BorrowedBadge({ from }: { from?: string }) {
  return <Badge variant="wait">Borrowed{from ? ` · ${from}` : ''}</Badge>;
}

export default BorrowedBadge;
