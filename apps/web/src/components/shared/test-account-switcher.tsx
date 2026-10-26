import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { getTestAccounts, switchTestAccount } from '@/lib/api/auth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { SidebarFooter } from '@/components/ui/sidebar';

/** Only the API can authorize this control, including after a role switch. */
export function TestAccountSwitcher({
  compact = false,
  sidebar = false
}: {
  compact?: boolean;
  sidebar?: boolean;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [switching, setSwitching] = useState(false);
  const { data } = useQuery({
    queryKey: ['test-accounts', user?.id],
    queryFn: getTestAccounts,
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false
  });
  if (!data?.enabled) return null;
  const currentRole = user?.user_metadata?.role;
  const currentAccount = data.accounts.find(
    (account) => account.role === currentRole
  );

  const handleSwitch = async (role: string) => {
    setSwitching(true);
    try {
      await queryClient.cancelQueries();
      await switchTestAccount(role);
      // A full navigation discards both role-specific UI state and any stale
      // in-flight request callbacks before the next identity renders.
      queryClient.clear();
      window.location.replace('/dashboard');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Account switch failed'
      );
      setSwitching(false);
      void queryClient.invalidateQueries({ queryKey: ['test-accounts'] });
    }
  };

  const control = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={compact ? 'icon' : 'default'}
          disabled={switching}
          aria-label={`Switch test account. Current: ${currentAccount?.label ?? currentRole}`}
          title="Switch test account"
          className={
            compact
              ? 'shrink-0'
              : 'h-auto w-full justify-start gap-2 px-3 py-2 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0'
          }
        >
          <UsersRound className="size-4 shrink-0" aria-hidden="true" />
          {!compact && (
            <>
              <span className="min-w-0 flex-1 text-left group-data-[collapsible=icon]:hidden">
                <span className="text-muted-foreground block text-[10px] font-semibold tracking-wider uppercase">
                  Test account
                </span>
                <span className="block truncate text-xs font-medium">
                  {switching
                    ? 'Switching…'
                    : (currentAccount?.label ?? currentRole)}
                </span>
              </span>
              <ChevronsUpDown
                className="size-3.5 shrink-0 group-data-[collapsible=icon]:hidden"
                aria-hidden="true"
              />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={compact ? 'bottom' : 'top'}
        align={compact ? 'end' : 'start'}
        className="w-64 max-w-[calc(100vw-2rem)]"
      >
        <DropdownMenuLabel>Switch test account</DropdownMenuLabel>
        <p className="text-muted-foreground px-2 pb-2 text-xs">
          Test admin session · Use real role permissions
        </p>
        <DropdownMenuSeparator />
        {data.accounts.map((account) => (
          <DropdownMenuItem
            key={account.role}
            disabled={switching || account.role === currentRole}
            onSelect={() => void handleSwitch(account.role)}
          >
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                {account.role === 'admin' && currentRole !== 'admin'
                  ? 'Return to Admin'
                  : account.label}
              </span>
              <span className="text-muted-foreground block truncate text-xs">
                {account.email}
              </span>
            </span>
            {account.role === currentRole && (
              <Check className="size-4" aria-label="Current account" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return sidebar ? (
    <SidebarFooter className="border-sidebar-border border-t p-2">
      {control}
    </SidebarFooter>
  ) : (
    control
  );
}
