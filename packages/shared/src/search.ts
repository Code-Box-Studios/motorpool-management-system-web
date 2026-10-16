/** Match each word against the visible text of a fully loaded record list. */
export function matchesSearch(
  search: string,
  values: readonly (string | null | undefined)[]
): boolean {
  const text = values
    .filter(Boolean)
    .join(' ')
    .replace(/_/g, ' ')
    .toLowerCase();
  return search
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word));
}
