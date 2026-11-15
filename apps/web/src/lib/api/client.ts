import {
  checkSessionRevision,
  onSharedSessionChange,
  withAuthCookieLock
} from './session-coordination';
import { hasKnownPendingLogout } from './logout-intent';

const BASE_URL =
  (import.meta.env.VITE_API_URL as string) ?? 'http://localhost:3001';

let accessToken: string | null = null;
let sessionIdentity: string | null = null;
let sessionRequests = new AbortController();

// Each identity owns its requests. A response from an ended session must never
// refresh its token, notify the next session, or reach a private query cache.
export function resetAuthSession(): AbortSignal {
  accessToken = null;
  sessionIdentity = null;
  sessionRequests.abort();
  sessionRequests = new AbortController();
  refreshPromise = null;
  return sessionRequests.signal;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function setSessionIdentity(id: string): void {
  sessionIdentity = id;
}

export function getAccessToken(): string | null {
  return accessToken;
}

let authFailureCb: (() => void) | null = null;
export function onAuthFailure(cb: () => void): () => void {
  authFailureCb = cb;
  return () => {
    if (authFailureCb === cb) authFailureCb = null;
  };
}

export function invalidateAuthSession(): void {
  resetAuthSession();
  authFailureCb?.();
}

onSharedSessionChange(invalidateAuthSession);

function assertCurrentSession(signal: AbortSignal): void {
  checkSessionRevision();
  signal.throwIfAborted();
}

export class ApiError extends Error {
  status: number;
  code: string;
  // The API's error envelope may carry a structured payload — IN_USE puts its
  // blocker counts here. Dropping it left the UI unable to say WHY.
  details?: unknown;
  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.name = 'ApiError';
  }
}

interface RequestOpts {
  signal?: AbortSignal;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  json?: unknown; // JSON body
  formData?: FormData; // multipart body (takes precedence over json)
  query?: Record<string, string | number | undefined | null>;
  headers?: Record<string, string>; // additional request headers
  skipRefresh?: boolean; // used by the refresh call itself to avoid recursion
  // Login/switch report a committed cookie boundary before discarding a stale
  // local operation, while their caller still owns the cross-document lock.
  onSessionEstablished?: () => void;
}

// Durable uploads use absolute HTTPS URLs; legacy local uploads retain
// /uploads paths that must be resolved against the API origin.
export function toAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return path.startsWith('/uploads') ? `${BASE_URL}${path}` : path;
}

// Inverse of toAssetUrl: turn a rendered absolute /uploads URL back into the
// relative path the API stores and matches against (e.g. for removedImages —
// the server filters vehicle.images by the relative path, not the absolute URL).
export function toRelativeAssetPath(url: string): string {
  return url.startsWith(BASE_URL) ? url.slice(BASE_URL.length) : url;
}

// A single shared in-flight refresh promise so concurrent 401s (e.g. the 5s GPS
// poll + page queries) don't race the rotating refresh token (spec §8).
let refreshPromise: Promise<boolean> | null = null;

async function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    const signal = sessionRequests.signal;
    const pending = (async () => {
      try {
        return await withAuthCookieLock(async () => {
          assertCurrentSession(signal);
          if (hasKnownPendingLogout()) return false;
          const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
            method: 'POST',
            // The server may already have consumed the source cookie. Keep
            // the lock until Set-Cookie arrives, even if this identity ended.
            credentials: 'include'
          });
          assertCurrentSession(signal);
          if (!res.ok) return false;
          const body = (await res.json()) as {
            accessToken?: string;
            user?: { id: string };
          };
          assertCurrentSession(signal);
          // A shared cookie may now belong to another account, including when
          // a tab missed all broadcasts. Never replay its old draft as that user.
          if (
            !body.user?.id ||
            (sessionIdentity !== null && body.user.id !== sessionIdentity)
          ) {
            resetAuthSession();
            authFailureCb?.();
            return false;
          }
          if (body.accessToken) {
            setSessionIdentity(body.user.id);
            setAccessToken(body.accessToken);
            return true;
          }
          return false;
        }, signal);
      } catch {
        return false;
      }
    })();
    refreshPromise = pending;
    void pending.finally(() => {
      // An old refresh must not clear a newer session's single-flight promise.
      setTimeout(() => {
        if (refreshPromise === pending) refreshPromise = null;
      }, 0);
    });
  }
  return refreshPromise;
}

function buildUrl(path: string, query?: RequestOpts['query']): string {
  const url = new URL(
    `${BASE_URL}${path.startsWith('/api') ? path : `/api${path}`}`
  );
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '')
        url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function raw(path: string, opts: RequestOpts): Promise<Response> {
  const headers: Record<string, string> = { ...opts.headers };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let bodyInit: BodyInit | undefined;
  if (opts.formData) {
    bodyInit = opts.formData; // browser sets multipart boundary
  } else if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyInit = JSON.stringify(opts.json);
  }
  return fetch(buildUrl(path, opts.query), {
    signal: [
      '/auth/login',
      '/auth/logout',
      '/auth/test-accounts/switch',
      '/auth/refresh'
    ].includes(path.replace(/^\/api/, ''))
      ? undefined
      : opts.signal,
    method: opts.method ?? 'GET',
    credentials: 'include',
    headers,
    body: bodyInit
  });
}

// Core request: attaches auth, unwraps the envelope, retries ONCE after a
// single-flight refresh on 401. On refresh failure, notifies the AuthProvider.
export async function apiRequest<T>(
  path: string,
  opts: RequestOpts = {}
): Promise<T> {
  const beforeRevisionCheck = sessionRequests.signal;
  assertCurrentSession(beforeRevisionCheck);
  if (
    path.replace(/^\/api/, '') !== '/auth/logout' &&
    hasKnownPendingLogout()
  ) {
    invalidateAuthSession();
    throw new DOMException('Sign-out pending', 'AbortError');
  }
  // The private subtree may have queued work before React processes an
  // invalidation. Such work cannot bootstrap a new identity using its old draft.
  if (
    !accessToken &&
    !sessionIdentity &&
    !['/auth/me', '/auth/login', '/auth/logout'].includes(path) &&
    !(
      path === '/auth/test-accounts/switch' &&
      opts.skipRefresh &&
      opts.headers?.Authorization
    )
  ) {
    throw new DOMException('Session changed', 'AbortError');
  }
  const sessionSignal = sessionRequests.signal;
  const requestSignal = opts.signal
    ? AbortSignal.any([opts.signal, sessionSignal])
    : sessionSignal;
  opts = {
    ...opts,
    signal: requestSignal
  };
  assertCurrentSession(requestSignal);
  let res = await raw(path, opts);
  if (res.ok) opts.onSessionEstablished?.();
  assertCurrentSession(requestSignal);

  // A 401 here means "no valid access token" — either it expired, or (on
  // boot, after a hard refresh) we never had one in memory to begin with.
  // Either way, attempt a cookie-based refresh before giving up. The login
  // call itself passes skipRefresh so a real INVALID_CREDENTIALS isn't
  // masked as "Session expired".
  if (res.status === 401 && !opts.skipRefresh) {
    const ok = await refreshOnce();
    assertCurrentSession(requestSignal);
    if (ok) {
      assertCurrentSession(requestSignal);
      res = await raw(path, opts); // retry once with the new token
      assertCurrentSession(requestSignal);
    } else {
      authFailureCb?.();
      throw new ApiError(401, 'UNAUTHORIZED', 'Session expired');
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  assertCurrentSession(requestSignal);
  const parsed = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const err = (
      parsed as {
        error?: { code?: string; message?: string; details?: unknown };
      }
    )?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'ERROR',
      err?.message ?? `Request failed (${res.status})`,
      err?.details
    );
  }
  return parsed as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOpts['query']) =>
    apiRequest<T>(path, { method: 'GET', query }),
  post: <T>(path: string, json?: unknown) =>
    apiRequest<T>(path, { method: 'POST', json }),
  patch: <T>(path: string, json?: unknown) =>
    apiRequest<T>(path, { method: 'PATCH', json }),
  del: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, formData: FormData) =>
    apiRequest<T>(path, { method: 'POST', formData }),
  patchForm: <T>(path: string, formData: FormData) =>
    apiRequest<T>(path, { method: 'PATCH', formData })
};
