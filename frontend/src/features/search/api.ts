import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import { useAuthenticatedQueryEnabled } from "../../lib/auth";
import type { SearchResult } from "../../lib/types";

export function useSearch(query: string) {
  const enabled = useAuthenticatedQueryEnabled(query.length > 0);
  return useQuery({
    queryKey: ["search", query],
    enabled,
    queryFn: () => apiFetch<SearchResult[]>("/search?q=" + encodeURIComponent(query)),
  });
}
