import {
  hasPendingLogout,
  isCurrentLogoutIntent,
  rememberLogout
} from './logout-intent';
import {
  publishSessionChange,
  assertSessionCoordinationAvailable,
  SessionCoordinationError,
  withAuthCookieLock
} from './session-coordination';
import type { AuthUser } from '@mms/shared';
import {
  api,
  ApiError,
  apiRequest,
  getAccessToken,
  invalidateAuthSession,
  resetAuthSession,
  setAccessToken,
  setSessionIdentity,
  toAssetUrl
} from './client.js';
import type { AppUser } from '../types';

// Maps the API's AuthUser (camelCase) into the FE's AppUser shape so
// consumers reading user.user_metadata.* keep working unchanged.
function toAppUser(u: AuthUser): AppUser {
  return {
    id: u.id,
    email: u.email,
    user_metadata: {
      full_name: u.fullName,
      role: u.role,
      branch_id: u.branchId,
      avatar_url: toAssetUrl(u.avatarUrl) // relative /uploads path → absolute for <img src>
    }
  };
}

interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

// Logs in against the API, stores the in-memory access token, and returns the FE user shape.
// Uses skipRefresh so a wrong-password 401 surfaces as a real error instead of
// being masked as "Session expired" by the client's refresh-on-401 gate.
export async function signIn(
  email: string,
  password: string
): Promise<AppUser> {
  if (hasPendingLogout())
    throw new Error('Finish signing out before signing in again.');
  const sessionSignal = resetAuthSession();
  const user = await withAuthCookieLock(async () => {
    if (hasPendingLogout())
      throw new Error('Finish signing out before signing in again.');
    assertSessionCoordinationAvailable();
    const res = await apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      json: { email, password },
      skipRefresh: true,
      onSessionEstablished: publishSessionChange
    });
    sessionSignal.throwIfAborted();
    setSessionIdentity(res.user.id);
    setAccessToken(res.accessToken);
    return toAppUser(res.user);
  }, sessionSignal).catch((error: unknown) => {
    if (error instanceof SessionCoordinationError)
      throw new ApiError(
        503,
        'SESSION_COORDINATION_UNAVAILABLE',
        error.message
      );
    throw error;
  });
  // IndexedDB releases the lock after the work callback returns. A peer can
  // end this identity before the transaction's completion promise settles.
  sessionSignal.throwIfAborted();
  return user;
}

// Logs out server-side (clears the refresh cookie) and drops the in-memory token.
export async function signOut(): Promise<void> {
  resetAuthSession();
  const intent = rememberLogout(true);
  // Hide peer workspaces before waiting for an already-active cookie mutation.
  // The holder still retains its transport lock until its response arrives.
  publishSessionChange();
  // This privacy action outlives local identity invalidations from another
  // logout. Queue acquisition still has its deadline, and transport stays locked.
  await withAuthCookieLock(async () => {
    if (!isCurrentLogoutIntent(intent)) return;
    let confirmed = false;
    try {
      await apiRequest('/auth/logout', {
        method: 'POST',
        skipRefresh: true,
        onSessionEstablished: () => {
          rememberLogout(false, intent);
          publishSessionChange();
          confirmed = true;
        }
      });
    } catch (error) {
      // A peer may have invalidated the old consumer while this already-started
      // request succeeded. Its committed completion was published in the hook.
      if (
        !confirmed ||
        !(error instanceof DOMException && error.name === 'AbortError')
      )
        throw error;
    }
  });
}

// Boot path: the client silently refreshes on 401, so a returning user with a
// live refresh cookie resolves here; anyone else gets null (→ login).
export async function getCurrentUser(): Promise<AppUser | null> {
  try {
    const u = await api.get<AuthUser>('/auth/me');
    setSessionIdentity(u.id);
    return toAppUser(u);
  } catch {
    return null;
  }
}

export interface TestAccount {
  role: string;
  email: string;
  label: string;
}
export type TestAccountsResponse =
  | { enabled: false }
  | { enabled: true; accounts: TestAccount[]; expiresAt: string };

export function getTestAccounts(): Promise<TestAccountsResponse> {
  return api.get<TestAccountsResponse>('/auth/test-accounts');
}

export async function switchTestAccount(role: string): Promise<void> {
  const bearer = getAccessToken();
  if (!bearer) throw new Error('Sign in before switching accounts.');
  invalidateAuthSession();
  const signal = resetAuthSession();
  const result = await withAuthCookieLock(async () => {
    assertSessionCoordinationAvailable();
    // Only this transition uses the former bearer. The old application is
    // already unmounted, and cannot dispatch or accept private requests.
    return apiRequest<LoginResponse>('/auth/test-accounts/switch', {
      method: 'POST',
      json: { role },
      skipRefresh: true,
      headers: { Authorization: `Bearer ${bearer}` },
      onSessionEstablished: publishSessionChange,
      signal
    });
  }, signal);
  signal.throwIfAborted();
  setSessionIdentity(result.user.id);
  setAccessToken(result.accessToken);
}
