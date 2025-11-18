import * as React from 'react';
import { Outlet, createRootRoute } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: RootComponent
});

function RootComponent() {
  // const { session } = useAuth();
  // const navigate = useNavigate();

  // React.useEffect(() => {
  //   if (session) {
  //     navigate({ to: '/dashboard' });
  //   } else {
  //     navigate({ to: '/login' });
  //   }
  // }, [session, navigate]);

  return (
    <React.Fragment>
      <Outlet />
    </React.Fragment>
  );
}
