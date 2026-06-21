import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  conversation_id: string | null;
}

/** A single rendered turn in a thread, as returned by /agent/conversation/*. */
export interface ConversationMessage {
  role: "user" | "assistant";
  text: string;
  writes: AgentWrite[];
  run_id: string | null;
  /** Client-only: a failed turn that was never persisted server-side. */
  error?: boolean;
}

export interface Conversation {
  id: string;
  messages: ConversationMessage[];
}

/** React Query key for the user's current (server-tracked) thread. */
export const CONVERSATION_KEY = ["agent", "conversation", "current"] as const;

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

/**
 * The user's current conversation, lazily created server-side. Lives in the
 * app-wide query cache, so it survives route changes and is shared across every
 * mount of the Aya window (and resumes the same thread on other devices).
 */
export function useCurrentConversation() {
  return useQuery({
    queryKey: CONVERSATION_KEY,
    queryFn: () => apiFetch<Conversation>("/agent/conversation/current"),
  });
}

export function useChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { message: string; conversation_id?: string | null }) =>
      apiFetch<AgentResponse>("/agent/chat", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: CONVERSATION_KEY, refetchType: "none" });
      invalidateForWrites(qc, data.writes);
    },
  });
}

/** Start a fresh thread; it becomes current and replaces the cached one. */
export function useNewConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<Conversation>("/agent/conversation/new", { method: "POST" }),
    onSuccess: (data) => {
      qc.setQueryData(CONVERSATION_KEY, data);
    },
  });
}

export function useCapture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { text: string }) =>
      apiFetch<AgentResponse>("/agent/capture", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: CONVERSATION_KEY, refetchType: "none" });
      invalidateForWrites(qc, data.writes);
    },
  });
}

export function useRevertRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) =>
      apiFetch<{ reverted: boolean }>(`/agent/runs/${runId}/revert`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONVERSATION_KEY, refetchType: "none" });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}
