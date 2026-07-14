import { SidebarTrigger } from '../ui/sidebar';
import { useLocation, Link } from '@tanstack/react-router';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import React from 'react';
import ThemeSwitcher from './theme-switcher';
import UserAvatar from './user-avatar';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "add-trip-ticket" -> "Add Trip Ticket". The old version called
// .replace('-', ' ') without the /g, so only the FIRST hyphen ever went — which
// is how "Add Trip-ticket" and a title-cased UUID reached the screen.
const prettify = (segment: string): string =>
  segment
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

const AppHeader = () => {
  const { pathname } = useLocation();
  const { label } = useBreadcrumb();

  const segments = pathname.split('/').filter(Boolean);

  const breadcrumbs = segments
    .map((segment, index) => ({
      segment,
      path: '/' + segments.slice(0, index + 1).join('/'),
      isLast: index === segments.length - 1
    }))
    // A record id is a database key, not a name. The record hands us a label
    // (see useBreadcrumbLabel); until it does, the crumb is simply dropped —
    // never rendered as a raw id.
    .filter(({ segment, isLast }) => !UUID_RE.test(segment) || (isLast && label))
    // Any page may name its own crumb, not just a record behind a UUID: five
    // roles share /dashboard and see five different screens, so a driver looking
    // at "My Trips" should not be told they are on the "Dashboard".
    .map((crumb) => ({
      ...crumb,
      label: crumb.isLast && label ? label : prettify(crumb.segment)
    }));

  return (
    // Sticky: the header carries where you are and who you are, and on a long
    // table or a tall record it used to scroll away and take both with it.
    <header className="border-border bg-sidebar sticky top-0 z-30 flex w-full items-center justify-between border-b-2 p-4">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={`${crumb.path}-${index}`}>
                {/* A separator goes BETWEEN crumbs. It used to be emitted before
                    every one of them, including the first — with an empty item
                    ahead of it — so every page opened with a chevron pointing at
                    nothing: "› Dashboard". */}
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {crumb.isLast ? (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link to={crumb.path}>
                        <span>{crumb.label}</span>
                      </Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex items-center gap-3">
        <ThemeSwitcher />
        <UserAvatar />
      </div>
    </header>
  );
};

export default AppHeader;
