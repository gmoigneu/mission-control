import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import type { GraphNode, GraphNodeDetail, GraphSnapshot } from "../../lib/types";

interface GraphQueryBody {
  intent: string;
  params?: Record<string, string>;
}

interface AdminJob {
  id: string;
  kind: string;
  status: "queued" | "running" | "succeeded" | "failed";
  result: Record<string, unknown> | null;
  error: string | null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForAdminJob(jobId: string): Promise<AdminJob> {
  const job = await apiFetch<AdminJob>(`/admin/jobs/${jobId}`);
  if (job.status === "succeeded") return job;
  if (job.status === "failed") {
    throw new Error(job.error ?? "Admin job failed");
  }
  await delay(750);
  return waitForAdminJob(jobId);
}

/** Run a structured graph query against the backend `/graph/query` endpoint. */
function graphQuery<T>(body: GraphQueryBody): Promise<T> {
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

/** Fetch the whole graph snapshot, optionally narrowed to one context slug. */
export function useGraphSnapshot(context?: string) {
  return useQuery({
    queryKey: ["graph", "full", context ?? ""],
    queryFn: () =>
      apiFetch<GraphSnapshot>(
        context ? `/graph/full?context=${encodeURIComponent(context)}` : "/graph/full",
      ),
  });
}

/** Fetch a single node's properties + relationships for the inspector panel. */
export function useNodeDetail(nodeId: string | undefined) {
  return useQuery({
    queryKey: ["graph", "node", nodeId ?? ""],
    enabled: !!nodeId,
    queryFn: () => apiFetch<GraphNodeDetail>(`/graph/node/${nodeId ?? ""}`),
  });
}

/** Trigger a full Neo4j projection rebuild, then refresh graph queries. */
export function useRebuildGraph() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const job = await apiFetch<AdminJob>("/admin/rebuild-graph", { method: "POST" });
      return waitForAdminJob(job.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["graph"] });
    },
  });
}
