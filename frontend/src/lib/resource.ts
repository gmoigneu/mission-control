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
    list: async (query) => {
      const params = new URLSearchParams(query);
      const path = params.size ? `${basePath}?${params.toString()}` : basePath;
      const { data, headers } = await apiFetchWithHeaders<TOut[]>(path);
      const page = parsePageInfo(headers, {
        limit: data.length || DEFAULT_PAGE_SIZE,
        offset: 0,
        count: data.length,
      });
      if (page.nextOffset === null) return data;

      const limit = page.limit;
      const offsets: number[] = [];
      for (let offset = page.nextOffset; offset < page.total; offset += limit) {
        offsets.push(offset);
      }
      const pages = await Promise.all(
        offsets.map((offset) => {
          const nextParams = new URLSearchParams(params);
          nextParams.set("limit", String(limit));
          nextParams.set("offset", String(offset));
          return apiFetchWithHeaders<TOut[]>(`${basePath}?${nextParams.toString()}`);
        }),
      );
      return [...data, ...pages.flatMap((next) => next.data)];
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
