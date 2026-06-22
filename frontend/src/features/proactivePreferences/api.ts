import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";

export type PreferenceAction =
  | "useful"
  | "not_useful"
  | "less_like_this"
  | "mute_routine"
  | "mute_entity_topic"
  | "remind_later"
  | "do_not_show_again"
  | "change_channel"
  | "change_frequency"
  | "never_at_this_time"
  | "urgent_when_happens";

export interface ProactiveFeedbackCreate {
  action: PreferenceAction;
  source_proactive_run_id?: string | null;
  routine_type?: string | null;
  entity_type?: string | null;
  entity_ref?: string | null;
  trigger_ref?: string | null;
  channel?: string | null;
  frequency?: string | null;
  remind_until?: string | null;
  never_at_time?: string | null;
  timezone_offset_minutes?: number | null;
  confirmed?: boolean;
}

export interface ProactivePreference {
  id: string;
  user_id: string;
  preference_type: string;
  scope: string;
  routine_type: string | null;
  entity_type: string | null;
  entity_ref: string | null;
  trigger_ref: string | null;
  value: Record<string, unknown>;
  source_proactive_run_id: string | null;
  requires_confirmation: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function useProactivePreferences(active?: boolean) {
  const qs = active === undefined ? "" : `?active=${String(active)}`;
  return useQuery({
    queryKey: ["proactive-preferences", { active }],
    queryFn: () => apiFetch<ProactivePreference[]>(`/proactive-preferences${qs}`),
  });
}

export function useCreateProactiveFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProactiveFeedbackCreate) =>
      apiFetch<ProactivePreference>("/proactive-preferences/feedback", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["proactive-preferences"] }),
  });
}

export function useUpdateProactivePreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiFetch<ProactivePreference>(`/proactive-preferences/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["proactive-preferences"] }),
  });
}
