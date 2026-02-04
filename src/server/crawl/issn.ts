const ISSN_RE = /^\d{4}-\d{3}[\dX]$/i;

export function normalizeIssn(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().toUpperCase();
  const normalized = trimmed.replace(/[^0-9X]/g, "");
  if (normalized.length !== 8) return null;
  const withDash = `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
  if (!ISSN_RE.test(withDash)) return null;
  return withDash;
}

export function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

