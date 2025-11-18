import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  // beforeLoad: async () => {
  //   const {
  //     data: { session }
  //   } = await supabase.auth.getSession();
  //   if (session) {
  //     throw redirect({
  //       to: '/dashboard'
  //     });
  //   }
  // },
  component: () => null
});
