import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ApprovalQueue from './queue';
import ApprovalHistory from './history';
import { useListControls } from '@/hooks/use-list-controls';

// shadcn paints the ACTIVE tab with --background, which on a light card sits
// lighter than the --muted track behind the inactive one — the control reads
// inverted. Same fix the trip-tickets page uses.
const ACTIVE_TAB =
  'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground dark:data-[state=active]:border-primary';

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-3 flex items-center gap-2">
    <span className="bg-signal size-2 rounded-full" />
    <span className="text-muted-foreground text-xs font-bold tracking-[0.11em] uppercase">
      {children}
    </span>
  </div>
);

/**
 * The EVP's entire job is one question: what needs my sign-off? So the landing
 * tab is a queue, not a dashboard. History sits beside it rather than beneath
 * it — acting on work and looking something up are different jobs, and the
 * headline still counts PENDING only, so "Nothing needs you" keeps meaning
 * what it says while a full History tab sits next to it.
 */
export default function EvpApprovalPage() {
  const [pending, setPending] = useState(0);
  const { filters, setFilter } = useListControls(['approvalTab']);
  const tab = filters.approvalTab === 'history' ? 'history' : 'queue';

  return (
    <div className="md:py-6">
      <SectionLabel>Awaiting your sign-off</SectionLabel>

      <h1 className="text-3xl font-medium tracking-tight md:text-4xl">
        {pending === 0
          ? 'Nothing needs you'
          : `${pending} thing${pending === 1 ? '' : 's'} need${pending === 1 ? 's' : ''} you`}
      </h1>
      <p className="text-slate mt-2 text-base">
        Fuel budgets and repair sign-offs. Declining always asks for a reason.
      </p>

      <Tabs
        value={tab}
        onValueChange={(value) =>
          setFilter('approvalTab', value === 'queue' ? '' : value)
        }
        className="mt-6"
      >
        <TabsList>
          <TabsTrigger value="queue" className={ACTIVE_TAB}>
            Needs you{pending > 0 ? ` (${pending})` : ''}
          </TabsTrigger>
          <TabsTrigger value="history" className={ACTIVE_TAB}>
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="queue"
          forceMount
          className="mt-6 data-[state=inactive]:hidden"
        >
          <ApprovalQueue onCountChange={setPending} />
        </TabsContent>
        <TabsContent value="history" className="mt-6">
          <ApprovalHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
