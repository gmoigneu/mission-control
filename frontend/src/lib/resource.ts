import { apiFetch, apiFetchWithHeaders } from "./api";
import { DEFAULT_PAGE_SIZE, type Page, parsePageInfo } from "./pagination";

export interface PageQuery {
  limit?: number;
  offset?: number;
  [key: string]: string | number | undefined;
}

export interface Resource<TOut, TCreate, TUpdate> {
  list: (query?: Record<string, string>) => Promise<TOut[]>;
  listPage: (query?: PageQuery) => Promise<Page<TOut>>;
  get: (id: string) => Promise<TOut>;
  create: (data: TCreate) => Promise<TOut>;
  update: (id: string, data: TUpdate) => Promise<TOut>;
  remove: (id: string) => Promise<void>;
}

export function resource<TOut, TCreate, TUpdate>(
  basePath: string,
): Resource<TOut, TCreate, TUpdate> {
  return {
    list: (query) => {
      const qs =
        query && Object.keys(query).length ? `?${new URLSearchParams(query).toString()}` : "";
      return apiFetch<TOut[]>(`${basePath}${qs}`);
    },
    listPage: async (query) => {
      const limit = query?.limit ?? DEFAULT_PAGE_SIZE;
      const offset = query?.offset ?? 0;
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      for (const [key, value] of Object.entries(query ?? {})) {
        if (key === "limit" || key === "offset" || value === undefined) continue;
        params.set(key, String(value));
      }
      const { data, headers } = await apiFetchWithHeaders<TOut[]>(
        `${basePath}?${params.toString()}`,
      );
      return {
        items: data,
        page: parsePageInfo(headers, { limit, offset, count: data.length }),
      };
    },
    get: (id) => apiFetch<TOut>(`${basePath}/${id}`),
    create: (data) => apiFetch<TOut>(basePath, { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) =>
      apiFetch<TOut>(`${basePath}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id) => apiFetch<void>(`${basePath}/${id}`, { method: "DELETE" }),
  };
}
