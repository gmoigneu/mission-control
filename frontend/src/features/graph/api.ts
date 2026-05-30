import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";

export interface GraphNeighbor {
  id: string;
  label: string;
  rel: string;
  label_text: string;
}

export function fetchNeighbors(personId: string): Promise<GraphNeighbor[]> {
  return apiFetch<GraphNeighbor[]>("/graph/query", {
    method: "POST",
    body: JSON.stringify({ intent: "neighbors", params: { person_id: personId } }),
  });
}

export function useNeighbors(personId: string | undefined) {
  return useQuery({
    queryKey: ["graph", "neighbors", personId ?? ""],
    queryFn: () => fetchNeighbors(personId as string),
    enabled: !!personId,
  });
}
