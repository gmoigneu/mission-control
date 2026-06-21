import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, apiFetchWithHeaders } from "../../lib/api";
import { DEFAULT_PAGE_SIZE, type Page, parsePageInfo } from "../../lib/pagination";
import type { AuditEntry } from "../../lib/types";

/** Maps backend entity_type singular → frontend query key (plural). */
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

export function useAudit() {
  return useQuery({ queryKey: ["audit"], queryFn: () => apiFetch<AuditEntry[]>("/audit") });
}

async function fetchAuditPage(
  limit: number,
  offset: number,
): Promise<Page<AuditEntry>> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const { data, headers } = await apiFetchWithHeaders<AuditEntry[]>(
    `/audit?${params.toString()}`,
  );
  return { items: data, page: parsePageInfo(headers, { limit, offset, count: data.length }) };
}

export function useAuditPage(offset = 0, limit = DEFAULT_PAGE_SIZE) {
  return useQuery({
    queryKey: ["audit", "page", { limit, offset }],
    queryFn: () => fetchAuditPage(limit, offset),
    placeholderData: (prev) => prev,
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
