export const LOGOUT_INTENT_KEY = 'mms.logout-pending';
const COOKIE = 'mms_logout_intent';

export interface LogoutIntent {
  revision: number;
  operation: string;
  pending: boolean;
}

// This document also keeps its newest decision when every durable write fails.
// Reload recovery still requires one checked persistent store or the URL.
let currentIntent: LogoutIntent | undefined;

function parseIntent(
  value: string | null | undefined
): LogoutIntent | undefined {
  if (!value) return;
  if (value === 'pending' || value === 'true')
    return { revision: 0, operation: 'legacy-pending', pending: true };
  if (value === 'confirmed' || value === 'false')
    return { revision: 0, operation: 'legacy-confirmed', pending: false };
  const match = /^v1:(\d+):([a-f0-9-]{36}):(pending|confirmed)$/.exec(value);
  if (!match) return;
  const revision = Number(match[1]);
  if (!Number.isSafeInteger(revision) || revision < 1) return;
  return { revision, operation: match[2], pending: match[3] === 'pending' };
}

function encodeIntent(intent: LogoutIntent): string {
  return `v1:${intent.revision}:${intent.operation}:${intent.pending ? 'pending' : 'confirmed'}`;
}

function compareIntents(a: LogoutIntent, b: LogoutIntent): number {
  return (
    a.revision - b.revision ||
    a.operation.localeCompare(b.operation) ||
    Number(b.pending) - Number(a.pending)
  );
}

function cookieIntent(): string | undefined {
  try {
    return document.cookie
      .split('; ')
      .find((value) => value.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
  } catch {
    return undefined;
  }
}

function readIntents(): { values: LogoutIntent[]; sessionBlocked: boolean } {
  const values: LogoutIntent[] = [];
  const add = (value: string | null | undefined) => {
    const intent = parseIntent(value);
    if (intent) values.push(intent);
  };
  add(cookieIntent());
  add(new URL(window.location.href).searchParams.get(LOGOUT_INTENT_KEY));
  try {
    add(localStorage.getItem(LOGOUT_INTENT_KEY));
  } catch {
    /* Other intent stores may remain readable. */
  }
  let sessionBlocked = false;
  try {
    add(sessionStorage.getItem(LOGOUT_INTENT_KEY));
  } catch {
    sessionBlocked = true;
  }
  if (currentIntent) values.push(currentIntent);
  return { values, sessionBlocked };
}

function latestIntent(values: LogoutIntent[]): LogoutIntent | undefined {
  return values.reduce<LogoutIntent | undefined>(
    (latest, value) =>
      !latest || compareIntents(value, latest) > 0 ? value : latest,
    undefined
  );
}

function knownPending(values: LogoutIntent[]): boolean | undefined {
  // Old boolean stores did not identify an operation; preserve their conservative
  // pending precedence until a versioned operation supersedes those records.
  const latest = latestIntent(values);
  if (latest?.revision === 0) return values.some((value) => value.pending);
  return latest?.pending;
}

// An active session reacts to an actual pending operation, not a newly blocked
// empty store. Cold startup still fails closed when intent cannot be checked.
export function hasKnownPendingLogout(): boolean {
  return knownPending(readIntents().values) ?? false;
}

export function hasPendingLogout(): boolean {
  const { values, sessionBlocked } = readIntents();
  return knownPending(values) ?? sessionBlocked;
}

// Recheck after queue acquisition: a suspended command must not revoke a
// session established after a later logout already completed.
export function isCurrentLogoutIntent(operation: LogoutIntent): boolean {
  const current = latestIntent(readIntents().values);
  return (
    current?.pending === true &&
    current.revision === operation.revision &&
    current.operation === operation.operation
  );
}

// Pending and confirmed records share an operation revision. A confirmation can
// therefore supersede its stale pending copy without suppressing a later logout.
export function rememberLogout(
  pending: boolean,
  operation?: LogoutIntent
): LogoutIntent {
  const { values } = readIntents();
  const intent: LogoutIntent = operation
    ? { ...operation, pending }
    : {
        revision:
          Math.max(Date.now(), ...values.map((value) => value.revision)) + 1,
        operation: crypto.randomUUID(),
        pending
      };
  const winner = latestIntent([...values, intent]) ?? intent;
  const value = encodeIntent(winner);
  currentIntent = winner;
  let stored = false;
  const superseded = (existing: string | null | undefined) => {
    const record = parseIntent(existing);
    return record !== undefined && compareIntents(record, winner) > 0;
  };
  try {
    if (superseded(cookieIntent())) stored = true;
    else {
      document.cookie = `${COOKIE}=${value}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
      stored = cookieIntent() === value;
    }
  } catch {
    /* Try document storage and the URL below. */
  }
  for (const storage of ['localStorage', 'sessionStorage'] as const) {
    try {
      const store = window[storage];
      if (superseded(store.getItem(LOGOUT_INTENT_KEY))) stored = true;
      else {
        store.setItem(LOGOUT_INTENT_KEY, value);
        stored = store.getItem(LOGOUT_INTENT_KEY) === value || stored;
      }
    } catch {
      /* A different store or the URL can still preserve intent. */
    }
  }
  const url = new URL(window.location.href);
  if (stored) url.searchParams.delete(LOGOUT_INTENT_KEY);
  else if (!superseded(url.searchParams.get(LOGOUT_INTENT_KEY)))
    url.searchParams.set(LOGOUT_INTENT_KEY, value);
  try {
    window.history.replaceState(window.history.state, '', url);
    const marker = new URL(window.location.href).searchParams.get(
      LOGOUT_INTENT_KEY
    );
    stored = stored || marker === value || superseded(marker);
  } catch {
    /* A successfully checked document store still preserves intent. */
  }
  if (!stored)
    throw new Error(
      'Sign-out intent could not be saved. Allow first-party storage before continuing.'
    );
  return intent;
}
