import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { makeResourceHooks } from "../../lib/hooks";
import { apiFetch } from "../../lib/api";
import { resource } from "../../lib/resource";
import type {
  DailyCheckIn,
  DailyCheckInUpdate,
  JournalEntry,
  JournalEntryCreate,
  JournalEntryUpdate,
} from "../../lib/types";

const journalResource = resource<JournalEntry, JournalEntryCreate, JournalEntryUpdate>(
  "/journal-entries",
);

export const {
  useList: useJournalEntries,
  useCreate: useCreateJournalEntry,
  useUpdate: useUpdateJournalEntry,
  useRemove: useDeleteJournalEntry,
} = makeResourceHooks<JournalEntry, JournalEntryCreate, JournalEntryUpdate>(
  "journal-entries",
  journalResource,
);

interface DailyCheckInQuery {
  days?: number;
  end?: string;
}

export function useDailyCheckIns(query: DailyCheckInQuery = {}) {
  return useQuery({
    queryKey: ["daily-checkins", query],
    queryFn: () => {
      const params = new URLSearchParams();
      if (query.days !== undefined) params.set("days", String(query.days));
      if (query.end) params.set("end", query.end);
      const qs = params.toString();
      return apiFetch<DailyCheckIn[]>(`/daily-checkins${qs ? `?${qs}` : ""}`);
    },
  });
}

export function useSetDailyCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { date: string; data: DailyCheckInUpdate }) =>
      apiFetch<DailyCheckIn>(`/daily-checkins/${args.date}`, {
        method: "PUT",
        body: JSON.stringify(args.data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-checkins"] });
      qc.invalidateQueries({ queryKey: ["journal-entries"] });
    },
  });
}
