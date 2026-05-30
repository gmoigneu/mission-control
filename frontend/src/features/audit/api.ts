import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import type { AuditEntry } from "../../lib/types";

export function useAudit() {
  return useQuery({ queryKey: ["audit"], queryFn: () => apiFetch<AuditEntry[]>("/audit") });
}

export function useRevert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (auditId: string) =>
      apiFetch<AuditEntry>(`/audit/${auditId}/revert`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });
}
