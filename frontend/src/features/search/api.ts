import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import type { SearchResult } from "../../lib/types";

export function useSearch(query: string) {
  return useQuery({
    queryKey: ["search", query],
    enabled: query.length > 0,
    queryFn: () => apiFetch<SearchResult[]>("/search?q=" + encodeURIComponent(query)),
  });
}
