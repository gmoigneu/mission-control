import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, apiFetchWithHeaders } from "../../lib/api";
import { DEFAULT_PAGE_SIZE, type Page, parsePageInfo } from "../../lib/pagination";
import type { ProactiveRun } from "../../lib/types";

async function fetchProactiveRuns(
  limit: number,
  offset: number,
): Promise<Page<ProactiveRun>> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const { data, headers } = await apiFetchWithHeaders<ProactiveRun[]>(
    `/proactive-runs?${params.toString()}`,
  );
  return { items: data, page: parsePageInfo(headers, { limit, offset, count: data.length }) };
}

export function useProactiveRunsPage(offset = 0, limit = DEFAULT_PAGE_SIZE) {
  return useQuery({
    queryKey: ["proactive-runs", "page", { limit, offset }],
    queryFn: () => fetchProactiveRuns(limit, offset),
    placeholderData: (prev) => prev,
  });
}

export function useDismissProactiveRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) =>
      apiFetch<ProactiveRun>(`/proactive-runs/${runId}/dismiss`, { method: "POST" }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["proactive-runs"] }),
  });
}

export function useMuteProactiveRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) =>
      apiFetch<ProactiveRun>(`/proactive-runs/${runId}/mute`, { method: "POST" }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["proactive-runs"] }),
  });
}
