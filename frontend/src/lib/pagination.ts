/** Paging metadata derived from a list response's headers. */
export interface PageInfo {
  /** Total number of rows matching the query (ignoring paging). */
  total: number;
  /** The limit that was applied. */
  limit: number;
  /** The offset that was applied. */
  offset: number;
  /** Offset to fetch the next page, or null when there is no next page. */
  nextOffset: number | null;
}

/** A single page of list results plus its paging metadata. */
export interface Page<T> {
  items: T[];
  page: PageInfo;
}

export const DEFAULT_PAGE_SIZE = 50;

function readInt(headers: Headers, name: string, fallback: number): number {
  const raw = headers.get(name);
  if (raw === null) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isNaN(value) ? fallback : value;
}

/** Parse the X-Total-Count / X-Limit / X-Offset / X-Next-Offset headers. */
export function parsePageInfo(
  headers: Headers,
  fallback: { limit: number; offset: number; count: number },
): PageInfo {
  const next = headers.get("X-Next-Offset");
  return {
    total: readInt(headers, "X-Total-Count", fallback.count),
    limit: readInt(headers, "X-Limit", fallback.limit),
    offset: readInt(headers, "X-Offset", fallback.offset),
    nextOffset: next === null ? null : Number.parseInt(next, 10),
  };
}
