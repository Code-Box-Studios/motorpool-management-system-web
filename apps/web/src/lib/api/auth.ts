import type { AuthUser } from '@mms/shared';
import { api, apiRequest, setAccessToken, toAssetUrl } from './client.js';
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
export async function signIn(email: string, password: string): Promise<AppUser> {
  const res = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    json: { email, password },
    skipRefresh: true
  });
  setAccessToken(res.accessToken);
  return toAppUser(res.user);
}

// Logs out server-side (clears the refresh cookie) and drops the in-memory token.
export async function signOut(): Promise<void> {
  await api.post('/auth/logout');
  setAccessToken(null);
}

// Boot path: the client silently refreshes on 401, so a returning user with a
// live refresh cookie resolves here; anyone else gets null (→ login).
export async function getCurrentUser(): Promise<AppUser | null> {
  try {
    const u = await api.get<AuthUser>('/auth/me');
    return toAppUser(u);
  } catch {
    return null;
  }
}
