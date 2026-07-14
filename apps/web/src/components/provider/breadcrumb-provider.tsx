import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from '@tanstack/react-router';
import { BreadcrumbContext } from '@/components/context/breadcrumb-context';

export const BreadcrumbProvider = ({ children }: { children: ReactNode }) => {
  const { pathname } = useLocation();

  // The label is stored against the path it was set on, rather than cleared by
  // an effect on navigation. Clearing it that way loses the race: child effects
  // run before their parent's, so the incoming page would set its label and the
  // provider would then immediately wipe it. Scoping it to a path means a stale
  // label simply stops matching, with no ordering to get wrong.
  const [entry, setEntry] = useState<{ path: string; label: string } | null>(
    null
  );

  const setLabel = useCallback(
    (label: string | null) => {
      setEntry(label ? { path: pathname, label } : null);
    },
    [pathname]
  );

  const value = useMemo(
    () => ({
      label: entry?.path === pathname ? entry.label : null,
      setLabel
    }),
    [entry, pathname, setLabel]
  );

  return (
    <BreadcrumbContext.Provider value={value}>
      {children}
    </BreadcrumbContext.Provider>
  );
};
