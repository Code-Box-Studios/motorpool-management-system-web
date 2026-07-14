import { useContext, useEffect } from 'react';
import { BreadcrumbContext } from '@/components/context/breadcrumb-context';

export const useBreadcrumb = () => useContext(BreadcrumbContext);

/**
 * Names the current record in the header's breadcrumb — "TT-1", "MMS-0003".
 * Pass `undefined` while the record is still loading; the crumb stays empty
 * rather than flashing a raw id. Safe to call unconditionally at the top of a
 * component.
 */
export const useBreadcrumbLabel = (label: string | null | undefined): void => {
  const { setLabel } = useBreadcrumb();

  useEffect(() => {
    if (label) setLabel(label);
  }, [label, setLabel]);
};
