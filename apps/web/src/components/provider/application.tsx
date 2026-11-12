import { useEffect, useState } from 'react';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routeTree } from '@/routeTree.gen';

const createAppRouter = (queryClient: QueryClient) =>
  createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    scrollRestoration: true
  });

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}

// AuthProvider remounts this owner at every session boundary. Old query and
// mutation callbacks retain only the discarded client; router matches and
// component state cannot survive into the next identity.
export function Application() {
  const [queryClient] = useState(() => new QueryClient());
  const [router] = useState(() => createAppRouter(queryClient));

  useEffect(
    () => () => {
      void queryClient.cancelQueries();
      queryClient.clear();
      router.cancelMatches();
      router.clearCache();
    },
    [queryClient, router]
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
