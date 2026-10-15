import Profile from '@/components/pages/profile';
import { createFileRoute } from '@tanstack/react-router';

// Available to every authenticated role. The avatar menu supplies navigation;
// no title metadata is needed in the sidebar.
export const Route = createFileRoute('/_authenticated/profile')({
  component: Profile
});
