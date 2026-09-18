import GpsMapPage from '@/components/pages/gps-map';
import { USER_ROLES } from '@/lib/enums';
import { createFileRoute } from '@tanstack/react-router';
import { MapPinned } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/gps-map')({
  component: GpsMapPage,
  staticData: {
    title: 'GPS Map',
    icon: MapPinned,
    group: 'Management',
    allowedRoles: [USER_ROLES.admin, USER_ROLES.evp_operations]
  }
});
