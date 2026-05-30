import { useMutation } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentWrite {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
}

export interface AgentResponse {
  agent_run_id: string;
  reply: string;
  writes: AgentWrite[];
}

// ─── Entity type → query key map ──────────────────────────────────────────────
// Mirrors (and extends) the map in src/features/audit/api.ts.

const ENTITY_TYPE_TO_KEY: Record<string, string> = {
  context: "contexts",
  project: "projects",
  company: "companies",
  person: "people",
  task: "tasks",
  tag: "tags",
  relationship: "relationships",
  observation: "observations",
  inbox_item: "inbox",
  entity_tag: "entity-tags",
  entity_link: "entity-links",
};

/**
 * Invalidate the list query for every distinct entity_type in `writes`, plus
 * the audit log.
 */
export function invalidateForWrites(qc: QueryClient, writes: AgentWrite[]) {
  const seen = new Set<string>();
  for (const w of writes) {
    const key = ENTITY_TYPE_TO_KEY[w.entity_type] ?? w.entity_type;
    if (!seen.has(key)) {
      seen.add(key);
      qc.invalidateQueries({ queryKey: [key] });
    }
  }
  qc.invalidateQueries({ queryKey: ["audit"] });
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useChat() {
  return useMutation({
    mutationFn: (payload: { message: string }) =>
      apiFetch<AgentResponse>("/agent/chat", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  });
}

export function useCapture() {
  return useMutation({
    mutationFn: (payload: { text: string }) =>
      apiFetch<AgentResponse>("/agent/capture", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  });
}

export function useRevertRun() {
  return useMutation({
    mutationFn: (runId: string) =>
      apiFetch<{ reverted: boolean }>(`/agent/runs/${runId}/revert`, {
        method: "POST",
      }),
  });
}
