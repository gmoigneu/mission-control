import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, apiFetchPage } from "../../lib/api";
import type { Page } from "../../lib/api";
import type { AuditEntry } from "../../lib/types";

export const AUDIT_PAGE_SIZE = 50;

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
  entity_tag: "entity-tags",
  entity_link: "entity-links",
};

export function useAudit(
  { limit = AUDIT_PAGE_SIZE, offset = 0 }: { limit?: number; offset?: number } = {},
) {
  return useQuery({
    queryKey: ["audit", { limit, offset }],
    queryFn: () =>
      apiFetchPage<AuditEntry[]>(`/audit?limit=${limit}&offset=${offset}`),
    placeholderData: (prev: Page<AuditEntry[]> | undefined) => prev,
  });
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
