import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// The asset lists read two ways. A table is how you scan and compare a fleet —
// plates, odometers and stock line up in a column and the eye runs down them —
// so it leads. A grid is how you browse by sight, worth more now that the
// records carry photos, and it is one click away. Same data, same links, same
// actions: only the shape changes.
//
// Emphasis is the ink pill this app already uses for the primary button and the
// active sidebar item, so the ACTIVE tab is the filled one. (shadcn's default
// paints the active tab with --background, which is lighter than the --muted
// track behind the inactive one, and the control reads backwards.)
const ACTIVE_TAB =
  'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground dark:data-[state=active]:border-primary';

interface ViewTabsProps {
  grid: ReactNode;
  table: ReactNode;
  /** Which view a page opens on. */
  defaultView?: 'grid' | 'table';
}

const ViewTabs = ({ grid, table, defaultView = 'table' }: ViewTabsProps) => (
  <Tabs defaultValue={defaultView} className="w-full">
    {/* Table first: the view a page opens on leads the control, as it does on
        the trip-ticket and job-order tables. */}
    <TabsList className="grid w-full max-w-[220px] grid-cols-2">
      <TabsTrigger value="table" className={ACTIVE_TAB}>
        Table
      </TabsTrigger>
      <TabsTrigger value="grid" className={ACTIVE_TAB}>
        Grid
      </TabsTrigger>
    </TabsList>
    <TabsContent value="table" className="mt-6">
      {table}
    </TabsContent>
    <TabsContent value="grid" className="mt-6">
      {grid}
    </TabsContent>
  </Tabs>
);

export default ViewTabs;
