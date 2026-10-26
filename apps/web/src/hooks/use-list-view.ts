import { useNavigate, useSearch } from '@tanstack/react-router';

/** Keep list layouts in shareable URLs without discarding other list controls. */
export function useListView<const View extends string>(
  allowedViews: readonly View[],
  defaultView: View
) {
  const params = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const isView = (value: unknown): value is View =>
    typeof value === 'string' && allowedViews.includes(value as View);
  const view = isView(params.view) ? params.view : defaultView;

  const setView = (next: string) => {
    if (!isView(next) || next === view) return;
    void navigate({
      to: '.',
      search: (previous: Record<string, unknown>) => ({
        ...previous,
        view: next
      }),
      // A layout change is a navigation the Back button should restore.
      resetScroll: false
    });
  };

  return { view, setView };
}
