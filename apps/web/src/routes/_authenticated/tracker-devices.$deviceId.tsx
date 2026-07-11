import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/tracker-devices/$deviceId')({
  component: () => <div />
});
