import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api";
import type {
  PlanningApplyItem,
  PlanningMessage,
  PlanningMessageCreate,
  PlanningMessageGenerate,
} from "../../lib/types";

type PlanningMessageUpdate = Partial<Pick<PlanningMessage, "status" | "title" | "summary" | "body">>;

const KEY = ["planning-messages"];

export function usePlanningMessages() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<PlanningMessage[]>("/planning/messages"),
  });
}

export function useCreatePlanningMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PlanningMessageCreate) =>
      apiFetch<PlanningMessage>("/planning/messages", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useGeneratePlanningMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PlanningMessageGenerate) =>
      apiFetch<PlanningMessage>("/planning/messages/generate", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdatePlanningMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PlanningMessageUpdate }) =>
      apiFetch<PlanningMessage>(`/planning/messages/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useApplyPlanningMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, items }: { id: string; items: PlanningApplyItem[] }) =>
      apiFetch<{ message: PlanningMessage; applied: string[]; audit_link: string }>(
        `/planning/messages/${id}/apply`,
        {
          method: "POST",
          body: JSON.stringify({ items }),
        },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["inbox"] });
      void qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useDeliverPlanningTelegram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<PlanningMessage>(`/planning/messages/${id}/deliver/telegram`, {
        method: "POST",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
