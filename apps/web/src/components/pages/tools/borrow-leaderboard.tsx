import type { TopBorrowedTool } from '@mms/shared';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BORROW_WINDOW_DAYS } from '@/lib/enums';

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-3 flex items-center gap-2">
    <span className="bg-signal size-2 rounded-full" />
    <span className="text-muted-foreground text-xs font-bold tracking-[0.11em] uppercase">
      {children}
    </span>
  </div>
);

/**
 * Borrow history starts empty and fills as tools move, so for the first weeks
 * this panel has nothing in it. An empty panel reads as broken software — it
 * says what is actually true instead, so nobody files a bug against a feature
 * that is working correctly.
 */
const BorrowLeaderboard = ({
  tools,
  isLoading
}: {
  tools: TopBorrowedTool[] | undefined;
  isLoading: boolean;
}) => (
  <section>
    <SectionLabel>Most borrowed · last {BORROW_WINDOW_DAYS} days</SectionLabel>
    <Card>
      <CardContent className="pt-6">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ) : !tools || tools.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No borrows recorded yet. This fills in as tools are signed out.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {tools.map((tool, index) => (
              <li
                key={tool.toolId}
                className="flex items-center gap-4 text-sm"
              >
                <span className="text-muted-foreground w-4 shrink-0 text-right font-mono text-xs tabular-nums">
                  {index + 1}
                </span>
                <Link
                  to="/tools/$toolsId"
                  params={{ toolsId: tool.toolId }}
                  className="flex-1 truncate font-medium hover:underline"
                >
                  {tool.name}
                </Link>
                {tool.isOverdue ? (
                  <Badge variant="stop">Overdue</Badge>
                ) : tool.isOut ? (
                  <Badge variant="neutral">Out now</Badge>
                ) : null}
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {tool.borrows} borrow{tool.borrows === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  </section>
);

export default BorrowLeaderboard;
