import TrackerDevices from '@/components/pages/tracker-devices';
import { USER_ROLES } from '@/lib/enums';
import { createFileRoute } from '@tanstack/react-router';
import { RadioTower } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/tracker-devices/')({
  component: TrackerDevices,
  staticData: {
    title: 'Trackers',
    icon: RadioTower,
    group: 'Settings',
    allowedRoles: [USER_ROLES.admin]
  }
});
