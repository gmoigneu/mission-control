import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { makeResourceHooks } from "../../lib/hooks";
import { apiFetch } from "../../lib/api";
import { useAuthenticatedQueryEnabled } from "../../lib/auth";
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

const journalHooks = makeResourceHooks<JournalEntry, JournalEntryCreate, JournalEntryUpdate>(
  "journal-entries",
  journalResource,
);

export const useJournalEntries = journalHooks.useList;
export const useCreateJournalEntry = journalHooks.useCreate;
export const useUpdateJournalEntry = journalHooks.useUpdate;

interface DailyCheckInQuery {
  days?: number;
  end?: string;
}

export function useDailyCheckIns(query: DailyCheckInQuery = {}) {
  const enabled = useAuthenticatedQueryEnabled();
  return useQuery({
    queryKey: ["daily-checkins", query],
    enabled,
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
