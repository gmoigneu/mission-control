export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// All backend calls go through the `/api` prefix, which the dev server (and the
// production reverse proxy) forwards to the FastAPI backend. This keeps the SPA's
// client routes (e.g. `/contexts`) from colliding with API paths of the same name.
const API_BASE = "/api";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "same-origin",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** A page of results plus the total count reported via the `X-Total-Count` header. */
export interface Page<T> {
  data: T;
  total: number;
}

/** Like {@link apiFetch} but also returns the `X-Total-Count` header for paginated lists. */
export async function apiFetchPage<T>(path: string, init?: RequestInit): Promise<Page<T>> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "same-origin",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text || res.statusText);
  }
  const total = Number(res.headers.get("X-Total-Count") ?? 0);
  const data = (await res.json()) as T;
  return { data, total };
}
