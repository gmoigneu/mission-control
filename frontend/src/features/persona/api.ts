import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Persona {
  name: string;
  role: string | null;
  tone: string | null;
  greeting: string | null;
  instructions: string | null;
  principles: string | null;
  boundaries: string | null;
  enabled: boolean;
  /** Read-only preview of the composed system prompt (SOUL + chat mechanics). */
  preview: string;
}

export interface PersonaUpdate {
  name?: string;
  role?: string | null;
  tone?: string | null;
  greeting?: string | null;
  instructions?: string | null;
  principles?: string | null;
  boundaries?: string | null;
  enabled?: boolean;
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function usePersona() {
  return useQuery({
    queryKey: ["persona"],
    queryFn: () => apiFetch<Persona>("/agent/persona"),
  });
}

export function useUpdatePersona() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PersonaUpdate) =>
      apiFetch<Persona>("/agent/persona", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: (persona) => {
      qc.setQueryData(["persona"], persona);
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useResetPersona() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<Persona>("/agent/persona/reset", { method: "POST" }),
    onSuccess: (persona) => {
      qc.setQueryData(["persona"], persona);
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}
