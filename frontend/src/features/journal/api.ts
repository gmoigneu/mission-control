import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type {
  JournalEntry,
  JournalEntryCreate,
  JournalEntryUpdate,
  JournalLog,
  JournalLogCreate,
} from "../../lib/types";

export const journalResource = resource<JournalEntry, JournalEntryCreate, JournalEntryUpdate>(
  "/journal",
);

export const {
  useList: useJournalEntries,
  useCreate: useCreateJournalEntry,
  useUpdate: useUpdateJournalEntry,
  useRemove: useDeleteJournalEntry,
} = makeResourceHooks<JournalEntry, JournalEntryCreate, JournalEntryUpdate>(
  "journal",
  journalResource,
);

export function useJournalLogs(entryId: string | null) {
  return useQuery({
    queryKey: ["journal-logs", entryId],
    queryFn: () => apiFetch<JournalLog[]>(`/journal/${entryId}/logs`),
    enabled: !!entryId,
  });
}

export function useAddJournalLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { entryId: string; data: JournalLogCreate }) =>
      apiFetch<JournalLog>(`/journal/${args.entryId}/logs`, {
        method: "POST",
        body: JSON.stringify(args.data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["journal-logs"] }),
  });
}

export function useDeleteJournalLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (logId: string) =>
      apiFetch<void>(`/journal/logs/${logId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["journal-logs"] }),
  });
}
