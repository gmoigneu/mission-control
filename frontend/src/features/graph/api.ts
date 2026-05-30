import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import type { GraphNode } from "../../lib/types";

interface GraphQueryBody {
  intent: string;
  params?: Record<string, string>;
}

/** Run a structured graph query against the backend `/graph/query` endpoint. */
export function graphQuery<T>(body: GraphQueryBody): Promise<T> {
  return apiFetch<T>("/graph/query", { method: "POST", body: JSON.stringify(body) });
}

/** Fetch the nodes directly connected to a person (any relationship type). */
export function useNeighbors(personId: string | undefined) {
  return useQuery({
    queryKey: ["graph", "neighbors", personId ?? ""],
    enabled: !!personId,
    queryFn: () =>
      graphQuery<GraphNode[]>({ intent: "neighbors", params: { person_id: personId! } }),
  });
}
