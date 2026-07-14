// The API hands us a role that has already been title-cased once
// ("evp_operations" -> "Evp Operations"), so a second pass of naive
// title-casing produced "Evp operations". Normalise back to a key and look up
// the name people actually use, which no amount of casing can derive: EVP is an
// initialism, not a word.
const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  driver: 'Driver',
  requester: 'Requester',
  security_guard: 'Security Guard',
  evp_operations: 'EVP Operations'
};

// The API substitutes the literal 'N/A' for a role/branch it could not resolve;
// a missing value is an em dash on screen, not a word.
export const present = (value?: string | null): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toUpperCase() === 'N/A') return undefined;
  return trimmed;
};

export const roleLabel = (role?: string | null): string | undefined => {
  const raw = present(role);
  if (!raw) return undefined;

  const key = raw.toLowerCase().replace(/[\s-]+/g, '_');
  if (ROLE_LABELS[key]) return ROLE_LABELS[key];

  // An unknown role still reads as words rather than an enum.
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};
