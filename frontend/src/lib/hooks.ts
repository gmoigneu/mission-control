import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuthenticatedQueryEnabled } from "./auth";
import type { PageQuery, Resource } from "./resource";

export function makeResourceHooks<TOut extends { id: string }, TCreate, TUpdate>(
  key: string,
  res: Resource<TOut, TCreate, TUpdate>,
) {
  function useList(query?: Record<string, string>) {
    const enabled = useAuthenticatedQueryEnabled();
    return useQuery({ queryKey: [key, query ?? {}], queryFn: () => res.list(query), enabled });
  }
  function usePagedList(query?: PageQuery) {
    const enabled = useAuthenticatedQueryEnabled();
    return useQuery({
      queryKey: [key, "page", query ?? {}],
      queryFn: () => res.listPage(query),
      enabled,
      placeholderData: (prev) => prev,
    });
  }
  function useCreate() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (data: TCreate) => res.create(data),
      onSuccess: () => qc.invalidateQueries({ queryKey: [key] }),
    });
  }
  function useUpdate() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (args: { id: string; data: TUpdate }) => res.update(args.id, args.data),
      onSuccess: () => qc.invalidateQueries({ queryKey: [key] }),
    });
  }
  function useRemove() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => res.remove(id),
      onSuccess: () => qc.invalidateQueries({ queryKey: [key] }),
    });
  }
  return { useList, usePagedList, useCreate, useUpdate, useRemove };
}
