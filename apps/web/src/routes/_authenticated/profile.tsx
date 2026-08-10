import Profile from '@/components/pages/profile';
import { createFileRoute } from '@tanstack/react-router';

// No `staticData` on purpose. It carries two meanings in this app and both
// point the same way here:
//   1. The guard in `_authenticated.tsx` only redirects when the matched route
//      declares `staticData.allowedRoles` — with none declared, every
//      authenticated role reaches their own profile, which is the point.
//   2. `AppSidebar` builds the rail from exactly those routes that HAVE
//      staticData, so declaring it (even listing all five roles) would put a
//      second "Profile" entry in the nav. The avatar menu is the entry point.
// Same shape as the other menu-less routes here (e.g. vehicles.add-vehicle).
export const Route = createFileRoute('/_authenticated/profile')({
  component: Profile
});
