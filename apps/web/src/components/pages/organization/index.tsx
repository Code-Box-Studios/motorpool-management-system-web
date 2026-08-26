import PageHeader from '@/components/shared/page-header';
import { ACTIVE_TAB } from '@/components/shared/view-tabs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResourceTab } from './resource-tab';

// Branches, Offices and Office Heads are the same table shape wearing
// different columns, so one tab control switches between three ResourceTab
// instances rather than three separate pages.
const Organization = () => (
  <div>
    <PageHeader
      title="Organization"
      description="Manage the branches, offices and office heads used across the app."
    />

    <Tabs defaultValue="branches" className="w-full">
      <TabsList>
        <TabsTrigger value="branches" className={ACTIVE_TAB}>
          Branches
        </TabsTrigger>
        <TabsTrigger value="offices" className={ACTIVE_TAB}>
          Offices
        </TabsTrigger>
        <TabsTrigger value="office-heads" className={ACTIVE_TAB}>
          Office Heads
        </TabsTrigger>
      </TabsList>
      <TabsContent value="branches" className="mt-6">
        <ResourceTab resource="branches" />
      </TabsContent>
      <TabsContent value="offices" className="mt-6">
        <ResourceTab resource="offices" />
      </TabsContent>
      <TabsContent value="office-heads" className="mt-6">
        <ResourceTab resource="office-heads" />
      </TabsContent>
    </Tabs>
  </div>
);

export default Organization;
