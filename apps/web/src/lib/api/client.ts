const BASE_URL = (import.meta.env.VITE_API_URL as string) ?? 'http://localhost:3000';

let accessToken: string | null = null;
export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function getAccessToken(): string | null {
  return accessToken;
}

let authFailureCb: (() => void) | null = null;
export function onAuthFailure(cb: () => void): void {
  authFailureCb = cb;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'ApiError';
  }
}

interface RequestOpts {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  json?: unknown; // JSON body
  formData?: FormData; // multipart body (takes precedence over json)
  query?: Record<string, string | number | undefined | null>;
  headers?: Record<string, string>; // extra headers (e.g. x-device-api-key for the gps demo)
  skipRefresh?: boolean; // used by the refresh call itself to avoid recursion
}

// Uploads are stored as RELATIVE paths (/uploads/<domain>/<file>) served from
// the API origin; the FE renders them as <img src>. Prefix with the API base so
// they resolve (they'd 404 against the FE origin otherwise).
export function toAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return path.startsWith('/uploads') ? `${BASE_URL}${path}` : path;
}

// A single shared in-flight refresh promise so concurrent 401s (e.g. the 5s GPS
// poll + page queries) don't race the rotating refresh token (spec §8).
let refreshPromise: Promise<boolean> | null = null;

async function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include'
        });
        if (!res.ok) return false;
        const body = (await res.json()) as { accessToken?: string };
        if (body.accessToken) {
          setAccessToken(body.accessToken);
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        // Clear after the microtask so all awaiters observe the same result.
        setTimeout(() => (refreshPromise = null), 0);
      }
    })();
  }
  return refreshPromise;
}

function buildUrl(path: string, query?: RequestOpts['query']): string {
  const url = new URL(`${BASE_URL}${path.startsWith('/api') ? path : `/api${path}`}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
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
    method: opts.method ?? 'GET',
    credentials: 'include',
    headers,
    body: bodyInit
  });
}

// Core request: attaches auth, unwraps the envelope, retries ONCE after a
// single-flight refresh on 401. On refresh failure, notifies the AuthProvider.
export async function apiRequest<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  let res = await raw(path, opts);

  // A 401 here means "no valid access token" — either it expired, or (on
  // boot, after a hard refresh) we never had one in memory to begin with.
  // Either way, attempt a cookie-based refresh before giving up. The login
  // call itself passes skipRefresh so a real INVALID_CREDENTIALS isn't
  // masked as "Session expired".
  if (res.status === 401 && !opts.skipRefresh) {
    const ok = await refreshOnce();
    if (ok) {
      res = await raw(path, opts); // retry once with the new token
    } else {
      authFailureCb?.();
      throw new ApiError(401, 'UNAUTHORIZED', 'Session expired');
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const parsed = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const err = (parsed as { error?: { code?: string; message?: string } })?.error;
    throw new ApiError(res.status, err?.code ?? 'ERROR', err?.message ?? `Request failed (${res.status})`);
  }
  return parsed as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOpts['query']) => apiRequest<T>(path, { method: 'GET', query }),
  post: <T>(path: string, json?: unknown) => apiRequest<T>(path, { method: 'POST', json }),
  patch: <T>(path: string, json?: unknown) => apiRequest<T>(path, { method: 'PATCH', json }),
  del: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, formData: FormData) => apiRequest<T>(path, { method: 'POST', formData }),
  patchForm: <T>(path: string, formData: FormData) => apiRequest<T>(path, { method: 'PATCH', formData })
};
