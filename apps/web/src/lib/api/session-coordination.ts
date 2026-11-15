import { hasKnownPendingLogout, LOGOUT_INTENT_KEY } from './logout-intent';

export class SessionCoordinationError extends Error {}

// Cookie rotation is shared by every document on this origin. Only opaque
// invalidation revisions cross documents; bearer tokens stay in memory.
const LOCK = 'mms.auth-cookie';
const REVISION = 'mms.auth-revision';
let observedRevision = readRevision();
const listeners = new Set<() => void>();
let channel: BroadcastChannel | undefined;
try {
  channel = new BroadcastChannel(REVISION);
  channel.onmessage = () => checkSessionRevision();
} catch {
  // Storage events and the synchronous request checks cover this fallback.
}
window.addEventListener('storage', (event) => {
  if (event.key === REVISION || event.key === LOGOUT_INTENT_KEY)
    checkSessionRevision();
});
window.addEventListener('pageshow', () => checkSessionRevision());
window.addEventListener('focus', () => checkSessionRevision());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkSessionRevision();
});

function readRevision(): string {
  let cookie: string | null = null;
  let storage: string | null = null;
  try {
    cookie =
      document.cookie
        .split('; ')
        .find((value) => value.startsWith(`${REVISION}=`))
        ?.slice(REVISION.length + 1) ?? null;
  } catch {
    /* The readable store still contributes its revision. */
  }
  try {
    storage = localStorage.getItem(REVISION);
  } catch {
    /* The readable store still contributes its revision. */
  }
  // Neither store has precedence: one may remain readable but reject writes.
  // Comparing both values detects a change even when the other is stale.
  return JSON.stringify([cookie, storage, hasKnownPendingLogout()]);
}

export function checkSessionRevision(): void {
  const revision = readRevision();
  if (revision !== observedRevision) {
    observedRevision = revision;
    for (const listener of listeners) listener();
  }
}

export function onSharedSessionChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function writeSharedValue(key: string, value: string): boolean {
  let durable = false;
  try {
    document.cookie = `${key}=${value}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    durable = document.cookie.split('; ').includes(`${key}=${value}`);
  } catch {
    /* The other first-party store may remain available. */
  }
  try {
    localStorage.setItem(key, value);
    durable = localStorage.getItem(key) === value || durable;
  } catch {
    /* The other first-party store may remain available. */
  }
  return durable;
}

const sharedStorageError = () =>
  new SessionCoordinationError(
    'Shared session storage is unavailable. Allow first-party storage and try again.'
  );

// Check durable coordination before changing the HTTP-only cookie, without
// invalidating any peer. A nonce probe cannot mistake a stale read-only value
// for a successful write, and its key is excluded from revision comparison.
export function assertSessionCoordinationAvailable(): void {
  const key = `${REVISION}.probe`;
  const durable = writeSharedValue(key, crypto.randomUUID());
  try {
    document.cookie = `${key}=; Path=/; Max-Age=0; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  } catch {
    /* Best-effort probe cleanup. */
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* Best-effort probe cleanup. */
  }
  if (!durable) throw sharedStorageError();
}

export function publishSessionChange(): void {
  const revision = crypto.randomUUID();
  if (!writeSharedValue(REVISION, revision)) throw sharedStorageError();
  observedRevision = readRevision();
  channel?.postMessage({ revision });
}

function aborted(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

const WAIT_MS = 10_000;
const busyError = () =>
  new SessionCoordinationError(
    'Session coordination is busy. Wait for the other tab to finish or close it, then retry.'
  );

function storageError(error?: DOMException | null): SessionCoordinationError {
  return new SessionCoordinationError(
    error?.name === 'VersionError'
      ? 'Session coordination was updated in another tab. Reload this page and retry.'
      : 'Session coordination storage is unavailable. Allow first-party storage, reload this page, and retry.'
  );
}

async function openLockDatabase(signal?: AbortSignal): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const cancel = () =>
      fail(signal?.reason ?? new DOMException('Session changed', 'AbortError'));
    const timer = setTimeout(() => fail(busyError()), WAIT_MS);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) {
      cancel();
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open('mms-auth-coordination', 2);
    } catch (error) {
      fail(storageError(error instanceof DOMException ? error : undefined));
      return;
    }
    request.onupgradeneeded = () => {
      if (settled) {
        request.transaction?.abort();
        return;
      }
      const db = request.result;
      // Version change is exclusive: every old v1 connection must finish or
      // close before its persisted-owner format can safely be retired.
      if (!db.objectStoreNames.contains('locks')) db.createObjectStore('locks');
      else request.transaction!.objectStore('locks').clear();
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      // An uncancellable open may complete after its caller aborted/timed out.
      if (settled) {
        db.close();
        return;
      }
      settled = true;
      cleanup();
      resolve(db);
    };
    request.onerror = () => fail(storageError(request.error));
    // A live v1 connection may block the exclusive upgrade. The bounded open
    // deadline reports this without clearing an owner or stealing its work.
  });
}

async function withTransactionLock<T>(
  db: IDBDatabase,
  work: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('locks', 'readwrite');
    const store = tx.objectStore('locks');
    let started = false;
    let cancelled = false;
    let outcome: { value: T } | { error: unknown } | undefined;
    let queueError: unknown;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    };
    const cancelQueued = (error: unknown) => {
      // An active cookie mutation must finish under this transaction, even if
      // its former identity ended. Only a waiting transaction can be cancelled.
      if (started || cancelled) return;
      cancelled = true;
      queueError = error;
      cleanup();
      tx.abort();
    };
    const cancel = () =>
      cancelQueued(
        signal?.reason ?? new DOMException('Session changed', 'AbortError')
      );
    const timer = setTimeout(() => cancelQueued(busyError()), WAIT_MS);
    signal?.addEventListener('abort', cancel, { once: true });
    tx.oncomplete = () => {
      cleanup();
      if (!outcome) reject(storageError());
      else if ('error' in outcome) reject(outcome.error);
      else resolve(outcome.value);
    };
    tx.onabort = () => {
      cleanup();
      reject(queueError ?? storageError(tx.error));
    };
    // One outstanding request keeps the browser-owned transaction alive while
    // work awaits IO. Schedule its successor synchronously inside onsuccess;
    // no timer, awaiting callback, or growing queue can create a lock gap.
    const pump = () => {
      const request = store.get(LOCK);
      request.onsuccess = () => {
        if (!started) {
          if (signal?.aborted) {
            cancel();
            return;
          }
          started = true;
          cleanup();
          // Promise conversion captures synchronous throws as well as rejects.
          void Promise.resolve()
            .then(work)
            .then(
              (value) => {
                outcome = { value };
              },
              (error) => {
                outcome = { error };
              }
            );
        }
        if (!outcome) pump();
      };
    };
    if (signal?.aborted) cancel();
    else pump();
  });
}

export async function withAuthCookieLock<T>(
  work: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  aborted(signal);
  if (navigator.locks) {
    const deadline = new AbortController();
    const acquisitionSignal = signal
      ? AbortSignal.any([signal, deadline.signal])
      : deadline.signal;
    const timer = setTimeout(() => deadline.abort(busyError()), WAIT_MS);
    try {
      return await navigator.locks.request(
        LOCK,
        { signal: acquisitionSignal },
        async () => {
          clearTimeout(timer);
          // The deadline may expire between grant and callback dispatch. Check
          // both reasons before work, then keep active HTTP outside the deadline.
          acquisitionSignal.throwIfAborted();
          return work();
        }
      );
    } finally {
      clearTimeout(timer);
    }
  }
  // Read/write transactions serialize across documents and are released by the
  // browser on real context termination. There is no persisted owner or lease.
  const db = await openLockDatabase(signal);
  try {
    aborted(signal);
    return await withTransactionLock(db, work, signal);
  } finally {
    db.close();
  }
}
