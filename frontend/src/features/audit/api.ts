import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import type { AuditEntry } from "../../lib/types";

/** Maps backend entity_type singular → frontend query key (plural). */
export const ENTITY_TYPE_TO_KEY: Record<string, string> = {
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

export function useAudit() {
  return useQuery({ queryKey: ["audit"], queryFn: () => apiFetch<AuditEntry[]>("/audit") });
}

export function useRevert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (auditId: string) =>
      apiFetch<AuditEntry>(`/audit/${auditId}/revert`, { method: "POST" }),
    onSuccess: (result) => {
      const listKey = ENTITY_TYPE_TO_KEY[result.entity_type] ?? result.entity_type;
      qc.invalidateQueries({ queryKey: [listKey] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}
