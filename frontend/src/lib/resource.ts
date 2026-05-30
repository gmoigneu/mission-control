import { apiFetch } from "./api";

export interface Resource<TOut, TCreate, TUpdate> {
  list: (query?: Record<string, string>) => Promise<TOut[]>;
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
    get: (id) => apiFetch<TOut>(`${basePath}/${id}`),
    create: (data) => apiFetch<TOut>(basePath, { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) =>
      apiFetch<TOut>(`${basePath}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id) => apiFetch<void>(`${basePath}/${id}`, { method: "DELETE" }),
  };
}
