import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Persona {
  id: string | null;
  name: string;
  role: string | null;
  tone: string | null;
  greeting: string | null;
  instructions: string | null;
  principles: string | null;
  boundaries: string | null;
  enabled: boolean;
  created_at: string | null;
  updated_at: string | null;
  is_default: boolean;
}

export interface PersonaUpdate {
  name?: string | null;
  role?: string | null;
  tone?: string | null;
  greeting?: string | null;
  instructions?: string | null;
  principles?: string | null;
  boundaries?: string | null;
  enabled?: boolean | null;
}

const PERSONA_KEY = ["persona"];

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function usePersona() {
  return useQuery({
    queryKey: PERSONA_KEY,
    queryFn: () => apiFetch<Persona>("/agent/persona"),
  });
}

export function useSavePersona() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PersonaUpdate) =>
      apiFetch<Persona>("/agent/persona", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      qc.setQueryData(PERSONA_KEY, data);
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useResetPersona() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<Persona>("/agent/persona/reset", {
        method: "POST",
      }),
    onSuccess: (data) => {
      qc.setQueryData(PERSONA_KEY, data);
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}
