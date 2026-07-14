import { createContext } from 'react';

// A detail route's URL segment is a UUID, and the header used to title-case it
// straight onto the screen ("E8dc6146 A6b2-4b22-..."). A record knows what it
// is called — "TT-1", "MMS-0003", a driver's name — so it hands that label up
// to the header, and the header renders the label instead of the key.
export interface BreadcrumbContextValue {
  label: string | null;
  setLabel: (label: string | null) => void;
}

export const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  label: null,
  setLabel: () => {}
});
